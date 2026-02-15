#!/usr/bin/env python3
"""Lightweight system metrics agent for Ollama Fleet Manager.

Serves a JSON endpoint at /metrics on port 9100 (configurable via PORT env var).
Designed to run as a systemd service on each Ollama GPU server.

Reads from procfs/sysfs on demand — zero overhead when idle.
"""

import json
import os
import glob
import time
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get("PORT", 9100))


def get_hostname():
    with open("/etc/hostname") as f:
        return f.read().strip()


def get_uptime():
    with open("/proc/uptime") as f:
        return float(f.read().split()[0])


def get_boot_time():
    uptime = get_uptime()
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - uptime))


def get_temperatures():
    temps = {}
    for zone in sorted(glob.glob("/sys/class/thermal/thermal_zone*/temp")):
        zone_name = zone.split("/")[-2]
        try:
            with open(zone) as f:
                val = f.read().strip()
                if val:
                    temps[zone_name] = int(val) / 1000.0
        except (ValueError, IOError):
            pass

    # Fallback: nvidia-smi for NVIDIA GPUs (e.g. DGX Spark)
    if not any("gpu" in k.lower() for k in temps):
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=3
            )
            if result.returncode == 0:
                for i, line in enumerate(result.stdout.strip().split("\n")):
                    if line.strip():
                        temps[f"gpu{i}"] = float(line.strip())
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    return temps


def get_memory():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 2:
                info[parts[0].rstrip(":")] = int(parts[1])

    total = info.get("MemTotal", 0) / 1024
    available = info.get("MemAvailable", 0) / 1024
    swap_total = info.get("SwapTotal", 0) / 1024
    swap_free = info.get("SwapFree", 0) / 1024

    return {
        "total_mb": round(total, 1),
        "used_mb": round(total - available, 1),
        "available_mb": round(available, 1),
        "swap_total_mb": round(swap_total, 1),
        "swap_used_mb": round(swap_total - swap_free, 1),
    }


def get_load_avg():
    with open("/proc/loadavg") as f:
        parts = f.read().split()
        return [float(parts[0]), float(parts[1]), float(parts[2])]


def get_cpu_percent():
    try:
        with open("/proc/stat") as f:
            line = f.readline()
        vals = list(map(int, line.split()[1:]))
        idle1 = vals[3]
        total1 = sum(vals)
        time.sleep(0.1)
        with open("/proc/stat") as f:
            line = f.readline()
        vals = list(map(int, line.split()[1:]))
        idle2 = vals[3]
        total2 = sum(vals)
        delta_idle = idle2 - idle1
        delta_total = total2 - total1
        if delta_total == 0:
            return None
        return round((1 - delta_idle / delta_total) * 100, 1)
    except Exception:
        return None


def get_gpu_percent():
    # Try nvidia-smi first
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip().split("\n")[0])
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Jetson fallback: tegrastats or sysfs
    try:
        for path in glob.glob("/sys/devices/gpu.0/load"):
            with open(path) as f:
                val = f.read().strip()
                if val:
                    return float(val) / 10.0
    except (ValueError, IOError):
        pass

    return None


def get_recent_boots():
    try:
        result = subprocess.run(
            ["last", "reboot", "-F"],
            capture_output=True, text=True, timeout=5
        )
        boots = []
        for line in result.stdout.strip().split("\n"):
            if line.startswith("reboot"):
                parts = line.split()
                # Extract date portion
                try:
                    date_str = " ".join(parts[4:9])
                    boots.append(date_str)
                except IndexError:
                    pass
        return boots[:10]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []


def get_reboot_causes():
    causes = {}
    try:
        result = subprocess.run(
            ["last", "reboot", "-F"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.strip().split("\n"):
            if line.startswith("reboot"):
                causes["last"] = {
                    "cause": "unknown",
                    "detail": line.strip(),
                }
                break
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return causes


def get_disk():
    st = os.statvfs("/")
    total = st.f_blocks * st.f_frsize
    free = st.f_bfree * st.f_frsize
    used = total - free
    return {
        "total_gb": round(total / (1024**3), 1),
        "used_gb": round(used / (1024**3), 1),
        "free_gb": round(free / (1024**3), 1),
    }


def collect_metrics():
    return {
        "hostname": get_hostname(),
        "uptime_seconds": round(get_uptime(), 1),
        "boot_time": get_boot_time(),
        "temperatures": get_temperatures(),
        "memory": get_memory(),
        "load_avg": get_load_avg(),
        "cpu_percent": get_cpu_percent(),
        "gpu_percent": get_gpu_percent(),
        "recent_boots": get_recent_boots(),
        "reboot_causes": get_reboot_causes(),
        "disk": get_disk(),
    }


class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/metrics":
            data = collect_metrics()
            body = json.dumps(data).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress request logs


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), MetricsHandler)
    print(f"Fleet metrics agent listening on port {PORT}")
    server.serve_forever()

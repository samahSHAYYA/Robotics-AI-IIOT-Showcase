"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: LLM client with Ollama support and mock fallback.
"""

import json
import urllib.request
from typing import Optional

SYSTEM_PROMPT = """You are an AI factory supervisor assistant for a robotics smart factory.
You have readonly access to telemetry data. You can:
  - Answer questions about robot status, sensor readings, and alerts.
  - Generate time-series charts by returning JSON with a chart field.
  - Never send commands to robots.

To request a chart, include a JSON block in your response like:
```json
{
  "chart": {
    "title": "Sensor Name",
    "y_label": "Value",
    "series": [
      {"name": "robot-01", "data": [{"timestamp": "...", "value": 45.2}]}
    ]
  }
}
```

Available data (queried from ops-api):
- GET /api/v1/telemetry → latest snapshot (CPU temp, battery, motor load, latency)
- GET /api/v1/robot/status → fleet status list
- Redis streams: events:core-platform, events:ai-service
Be concise and technical."""


class LLMClient:
    def __init__(self, base_url: str = ""):
        self.base_url = base_url.rstrip("/")
        self.ready = False
        if base_url:
            try:
                urllib.request.urlopen(f"{base_url}/api/tags", timeout=3)
                self.ready = True
            except Exception:
                self.ready = False

    def chat(self, message: str, context: Optional[str] = None) -> dict:
        if self.ready and self.base_url:
            return self._ollama_chat(message, context)
        return self._mock_chat(message, context)

    def _ollama_chat(self, message: str, context: Optional[str] = None) -> dict:
        body = {
            "model": "qwen3:14b",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
            ],
            "stream": False,
        }
        if context:
            body["messages"].append({"role": "user", "content": f"Context:\n{context}\n\nQuestion: {message}"})
        else:
            body["messages"].append({"role": "user", "content": message})

        req = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            result = json.loads(resp.read())
            reply = result.get("message", {}).get("content", "")
            return self._parse_reply(reply)
        except Exception as e:
            return {"reply": f"LLM error: {e}", "chart": None}

    def _mock_chat(self, message: str, context: Optional[str] = None) -> dict:
        msg_lower = message.lower()
        if "temperature" in msg_lower or "temp" in msg_lower:
            return {
                "reply": (
                    "Robot CPU temperatures are within normal range "
                    "(42-58 °C). No thermal anomalies detected."
                ),
                "chart": {
                    "title": "CPU Temperature (°C)",
                    "y_label": "Temperature (°C)",
                    "series": [
                        {
                            "name": "robot-01",
                            "data": [
                                {"timestamp": "T-30s", "value": 45.2},
                                {"timestamp": "T-20s", "value": 47.1},
                                {"timestamp": "T-10s", "value": 46.8},
                                {"timestamp": "T-0s", "value": 48.3},
                            ],
                        },
                        {
                            "name": "robot-02",
                            "data": [
                                {"timestamp": "T-30s", "value": 52.1},
                                {"timestamp": "T-20s", "value": 53.4},
                                {"timestamp": "T-10s", "value": 55.0},
                                {"timestamp": "T-0s", "value": 54.2},
                            ],
                        },
                    ],
                },
            }
        if "battery" in msg_lower:
            return {
                "reply": "All robot batteries above 60%. robot-03 at 62% — schedule recharge within 2h.",
                "chart": {
                    "title": "Battery Level (%)",
                    "y_label": "Charge (%)",
                    "series": [
                        {
                            "name": "robot-01",
                            "data": [
                                {"timestamp": "T-30s", "value": 85},
                                {"timestamp": "T-20s", "value": 83},
                                {"timestamp": "T-10s", "value": 81},
                                {"timestamp": "T-0s", "value": 79},
                            ],
                        },
                        {
                            "name": "robot-03",
                            "data": [
                                {"timestamp": "T-30s", "value": 68},
                                {"timestamp": "T-20s", "value": 66},
                                {"timestamp": "T-10s", "value": 64},
                                {"timestamp": "T-0s", "value": 62},
                            ],
                        },
                    ],
                },
            }
        if "alert" in msg_lower or "error" in msg_lower or "critical" in msg_lower:
            return {
                "reply": (
                    "No critical alerts in the last 5 minutes. "
                    "3 warnings logged: high motor load on robot-02, "
                    "network latency spike on robot-03."
                ),
                "chart": None,
            }
        return {
            "reply": (
                "All systems nominal. 5 robots online, 0 errors, "
                "average CPU 46 °C, battery 74%. "
                "Ask about temperature, battery, or alerts for details."
            ),
            "chart": None,
        }

    @staticmethod
    def _parse_reply(reply: str) -> dict:
        import re
        chart = None
        match = re.search(r"```json\s*(\{.*?\})\s*```", reply, re.DOTALL)
        if match:
            try:
                chart = json.loads(match.group(1)).get("chart")
                reply = reply[: match.start()].strip()
            except (json.JSONDecodeError, AttributeError):
                pass
        return {"reply": reply.strip(), "chart": chart}

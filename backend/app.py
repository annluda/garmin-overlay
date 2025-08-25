import os
import time
from flask import Flask, jsonify, send_file
from flask_cors import CORS
import garminconnect

# Flask app
app = Flask(__name__)
CORS(app)

# Garmin 登录
garmin = garminconnect.Garmin(is_cn=True)
garmin.login(".garmin_tokens")

# GPX 文件存储目录
GPX_DIR = "./gpx_data"
os.makedirs(GPX_DIR, exist_ok=True)

# 内存缓存
activities_cache = {}   # {"data": [...], "timestamp": float}
activity_info_cache = {}  # key=activity_id, value={"data": {...}, "timestamp": float}

# 缓存有效期（秒）
CACHE_TTL = 600
# 懒惰清理配置
GPX_MAX_AGE = 7 * 24 * 3600  # 文件保留 7 天


def lazy_cleanup_gpx():
    """请求时触发的懒惰清理"""
    now = time.time()
    for filename in os.listdir(GPX_DIR):
        filepath = os.path.join(GPX_DIR, filename)
        if os.path.isfile(filepath):
            file_age = now - os.path.getmtime(filepath)
            if file_age > GPX_MAX_AGE:
                try:
                    os.remove(filepath)
                    print(f"Deleted expired GPX file: {filename}")
                except Exception as e:
                    print(f"Failed to delete {filename}: {e}")


@app.route("/activities", methods=["GET"])
def get_activities():
    now = time.time()
    # 检查缓存
    if activities_cache and now - activities_cache.get("timestamp", 0) < CACHE_TTL:
        return jsonify(activities_cache["data"])

    try:
        activities = garmin.get_activities(0, 3)
        result = [
            {
                "activityId": a["activityId"],
                "activityName": a["activityName"],
                "startTimeLocal": a["startTimeLocal"],
                "activityType": a["activityType"]["typeKey"],
                "distance": round(a["distance"]),
                "duration": round(a["duration"]),
                "calories": round(a["calories"]),
                "elevationGain": round(a["elevationGain"]),
            }
            for a in activities
        ]
        # 更新缓存
        activities_cache["data"] = result
        activities_cache["timestamp"] = now
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/activities/<int:activity_id>/info", methods=["GET"])
def get_activity_info(activity_id):
    now = time.time()
    # 检查缓存
    if activity_id in activity_info_cache:
        cached = activity_info_cache[activity_id]
        if now - cached["timestamp"] < CACHE_TTL:
            return jsonify(cached["data"])

    try:
        activity = garmin.get_activity(activity_id)
        info = {
            "activityId": activity["activityId"],
            "activityName": activity["activityName"],
            "startTimeLocal": activity["startTimeLocal"],
            "activityType": activity["activityType"]["typeKey"],
            "distance": round(activity["distance"]),
            "duration": round(activity["duration"]),
            "calories": round(activity["calories"]),
            "elevationGain": round(activity["elevationGain"]),
        }
        # 更新缓存
        activity_info_cache[activity_id] = {"data": info, "timestamp": now}
        return jsonify(info)
    except Exception as e:
        return jsonify({"error": str(e)}), 404


@app.route("/activities/<int:activity_id>/gpx", methods=["GET"])
def get_activity_gpx(activity_id):
    lazy_cleanup_gpx()  # 触发懒惰清理
    try:
        gpx_file = os.path.join(GPX_DIR, f"{activity_id}.gpx")
        if not os.path.exists(gpx_file):
            gpx_data = garmin.download_activity(activity_id, dl_fmt=garmin.ActivityDownloadFormat.GPX)
            with open(gpx_file, "wb") as fb:
                fb.write(gpx_data)
        return send_file(gpx_file, mimetype="application/gpx+xml")
    except Exception as e:
        return jsonify({"error": str(e)}), 404


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=9245)

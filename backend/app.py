import os
import time
from flask import Flask, jsonify, send_file
from flask_cors import CORS
import garminconnect
import gpxpy
from math import radians, sin, cos, sqrt, atan2
from datetime import timedelta
import requests


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

AMAP_KEY = os.getenv("AMAP_KEY")


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
        activities = garmin.get_activities(0, 5)
        result = [
            {
                "activityId": a["activityId"],
                "activityName": get_activity_destination(a["activityId"]),
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
            "startTimeLocal": activity["summaryDTO"]["startTimeLocal"],
            "activityType": activity["activityTypeDTO"]["typeKey"],
            "distance": round(activity["summaryDTO"]["distance"]),
            "duration": round(activity["summaryDTO"]["duration"]),
            "calories": round(activity["summaryDTO"]["calories"]),
            "elevationGain": round(activity["summaryDTO"]["elevationGain"]),
        }

        dest = get_activity_destination(activity_id)
        info["activityName"] = dest

        # 更新缓存
        activity_info_cache[activity_id] = {"data": info, "timestamp": now}
        return jsonify(info)
    except Exception as e:
        return jsonify({"error": str(e)}), 404


def download_gpx(activity_id):
    gpx_file = os.path.join(GPX_DIR, f"{activity_id}.gpx")
    if not os.path.exists(gpx_file):
        gpx_data = garmin.download_activity(activity_id, dl_fmt=garmin.ActivityDownloadFormat.GPX)
        with open(gpx_file, "wb") as fb:
            fb.write(gpx_data)
    return gpx_file


@app.route("/activities/<int:activity_id>/gpx", methods=["GET"])
def get_activity_gpx(activity_id):
    lazy_cleanup_gpx()  # 触发懒惰清理
    try:
        gpx_file = download_gpx(activity_id)
        return send_file(gpx_file, mimetype="application/gpx+xml")
    except Exception as e:
        return jsonify({"error": str(e)}), 404


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0  # Radius of Earth in kilometers

    lat1_rad = radians(lat1)
    lon1_rad = radians(lon1)
    lat2_rad = radians(lat2)
    lon2_rad = radians(lon2)

    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad

    a = sin(dlat / 2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    distance = R * c
    return distance


def get_furthest_point(gpx_file_path):
    
    with open(gpx_file_path, 'r') as gpx_file:
        gpx = gpxpy.parse(gpx_file)

    all_points = []
    for track in gpx.tracks:
        for segment in track.segments:
            all_points.extend(segment.points)

    start_point = all_points[0]
    points_to_check = all_points

    # Filter by time (middle segment) if time is available
    if all_points[0].time and all_points[-1].time:
        start_time = all_points[0].time
        end_time = all_points[-1].time
        duration = (end_time - start_time).total_seconds()

        if duration > 0:
            middle_start_time = start_time + timedelta(seconds=duration / 3)
            middle_end_time = start_time + timedelta(seconds=2 * duration / 3)
            
            middle_points = [p for p in all_points if p.time and middle_start_time <= p.time <= middle_end_time]
            
            if middle_points:
                # Sample points from the middle segment (one per minute)
                sampled_points = []
                if middle_points:
                    sampled_points.append(middle_points[0])
                    last_sampled_time = middle_points[0].time
                    for point in middle_points:
                        if point.time and (point.time - last_sampled_time).total_seconds() >= 60:
                            sampled_points.append(point)
                            last_sampled_time = point.time
                
                if sampled_points:
                    points_to_check = sampled_points
                else:
                    points_to_check = middle_points

    furthest_point = None
    max_distance = 0

    for point in points_to_check:
        distance = haversine(start_point.latitude, start_point.longitude, point.latitude, point.longitude)
        if distance > max_distance:
            max_distance = distance
            furthest_point = point

    if not furthest_point:
        # Fallback to all points if no furthest point was found
        for point in all_points:
            distance = haversine(start_point.latitude, start_point.longitude, point.latitude, point.longitude)
            if distance > max_distance:
                max_distance = distance
                furthest_point = point

    return f"{furthest_point.longitude:.6f},{furthest_point.latitude:.6f}"


def get_activity_destination(activity_id):

    gpx_file = download_gpx(activity_id)
    lonlat = get_furthest_point(gpx_file)

    dest = None
    try:
        url = f"https://restapi.amap.com/v3/geocode/regeo?key={AMAP_KEY}&location={lonlat}&extensions=all&poitype=风景名胜"
        regeo = requests.get(url).json()["regeocode"]

        pois = regeo["pois"]
        street = regeo["addressComponent"]["streetNumber"]["street"]
        roads = regeo["roads"]
        district = regeo["addressComponent"]["district"]
        
        if len(pois) > 0:
            dest = pois[0]["name"]
        elif len(street) > 0:
            dest = street
        elif len(roads) > 0:
            dest = "-".join(r["name"] for r in roads)
        else:
            dest = district
    except Exception as e:
        print(e, ">>>", regeo)
    
    return dest


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=9245)

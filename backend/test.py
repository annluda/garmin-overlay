import os

import garminconnect

garmin = garminconnect.Garmin(is_cn=True)
garmin.login(".garmin_tokens")

activities = garmin.get_activities(0, 5)

last_activity = activities[0]
activity_id = last_activity["activityId"]

info = {
    "activityId": activity_id,
    "activityName": last_activity["activityName"],
    "startTimeLocal": last_activity["startTimeLocal"],
    "activityType": last_activity["activityType"]["typeKey"],
    "distance": last_activity["distance"],  # 米
    "duration": last_activity["duration"],  # 秒
    "calories": last_activity["calories"],
    "elevationGain": last_activity["elevationGain"],  # 米
}

print(activity_id, info)

output_file = f"./gpx_data/{str(activity_id)}.gpx"
if os.path.exists(output_file):
    pass
else:
    gpx_data = garmin.download_activity(activity_id, dl_fmt=garmin.ActivityDownloadFormat.GPX)
    with open(output_file, "wb") as fb:
        fb.write(gpx_data)


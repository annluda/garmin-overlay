⸻

Garmin Activities API 接口文档

Base URL: http://<服务器IP>:9245

⸻

1. 获取活动列表

接口: /activities
方法: GET
说明: 获取最近 5 条活动信息，带缓存，避免频繁请求 Garmin API

请求示例:

GET http://localhost:9245/activities

返回示例:

[
  {
    "activityId": 123456789,
    "activityName": "Morning Ride",
    "startTimeLocal": "2025-08-20 07:30:00",
    "activityType": "cycling",
    "distance": 12000,
    "duration": 3600,
    "calories": 450,
    "elevationGain": 50
  },
  ...
]


⸻

2. 获取活动详情

接口: /activities/<activity_id>/info
方法: GET
说明: 根据活动 ID 获取活动详细信息

请求示例:

GET http://localhost:9245/activities/123456789/info

返回示例:

{
  "activityId": 123456789,
  "activityName": "Morning Ride",
  "startTimeLocal": "2025-08-20 07:30:00",
  "activityType": "cycling",
  "distance": 12000,
  "duration": 3600,
  "calories": 450,
  "elevationGain": 50
}

错误返回示例:

{
  "error": "Activity not found"
}


⸻

3. 获取活动 GPX 文件

接口: /activities/<activity_id>/gpx
方法: GET
说明: 根据活动 ID 获取 GPX 文件，如果本地已有文件直接返回，否则下载后返回

请求示例:

GET http://localhost:9245/activities/123456789/gpx

返回:
	•	Content-Type: application/gpx+xml
	•	返回 GPX 文件内容，可直接下载或解析

错误返回示例:

{
  "error": "Failed to get GPX: Activity not found"
}

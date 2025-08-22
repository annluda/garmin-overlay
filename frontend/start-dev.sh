#!/bin/bash

echo "🔧 启动开发环境..."

# 检查后端服务
if curl -s http://localhost:9245/activities > /dev/null; then
    echo "✅ 后端服务正在运行"
else
    echo "⚠️  后端服务未运行，请先启动 Garmin API 服务"
    echo "   启动后端: python your_backend_script.py"
fi

# 启动前端开发服务器
echo "🌐 启动前端开发服务器..."
npm start

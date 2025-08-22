# Garmin Activity Image Editor

一个现代化的 Web 应用，用于为 Garmin 活动数据生成带有路线和统计信息的精美图片。

## 🚀 快速开始

### 开发环境
```bash
# 启动开发服务器
./start-dev.sh

# 或者手动启动
npm start
```

### 生产部署
```bash

# 或者分步操作
npm run build
npm run deploy
```

### Docker 部署
```bash
# 构建镜像
docker build -t garmin-activity-editor .

# 运行容器
docker run -p 3000:80 garmin-activity-editor
```

## 📝 配置

### 环境变量
- `REACT_APP_API_URL`: 后端 API 地址（默认: http://localhost:5000）

### 后端要求
确保 Garmin API 服务运行在指定端口，并提供以下接口：
- `GET /activities` - 获取活动列表
- `GET /activities/{id}/gpx` - 获取 GPX 数据

## 🎨 功能特性

- ✅ 现代化 UI 设计
- ✅ 响应式布局
- ✅ 拖拽上传图片
- ✅ 实时路线可视化
- ✅ 可自定义文字和路线样式
- ✅ 一键导出图片
- ✅ PWA 支持

## 🛠 技术栈

- React 18
- Tailwind CSS
- Lucide React Icons
- HTML5 Canvas
- Docker
- Nginx

## 📦 部署选项

1. **开发环境**: `npm start`
2. **静态部署**: Netlify, Vercel
3. **Docker 部署**: 生产环境推荐
4. **传统服务器**: Nginx + 静态文件

## 🔧 自定义

### 修改 API 地址
```bash
# 开发环境
export REACT_APP_API_URL=http://your-api-domain.com

# 或修改 .env 文件
echo "REACT_APP_API_URL=http://your-api-domain.com" > .env
```

### 添加新功能
```javascript
// src/App.js
const [newFeature, setNewFeature] = useState(false);

// 在 JSX 中添加控制元素
<input 
  type="checkbox" 
  checked={newFeature}
  onChange={(e) => setNewFeature(e.target.checked)}
/>
```

## 🐛 故障排除

### CORS 问题
如果遇到跨域问题，可以：
1. 在后端添加 CORS 头
2. 使用开发代理: 在 package.json 添加 `"proxy": "http://localhost:5000"`
3. 部署时使用 nginx 代理

### 构建问题
```bash
# 清理缓存
npm clean-install

# 重新构建
rm -rf build node_modules
npm install
npm run build
```

## 📄 许可证

MIT License

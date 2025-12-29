# Web Project

This is a full-stack web project created with the Projecter applet, featuring:

- 🌐 **Frontend**: HTML, CSS, and JavaScript
- 🚀 **Backend**: Node.js web server
- 📡 **API**: RESTful endpoints
- 📱 **Responsive**: Mobile-friendly design

## Project Structure

```
├── index.html          # Main HTML page
├── styles.css          # CSS styling
├── script.js           # JavaScript interactivity
├── server.js           # Node.js web server
├── package.json        # Node.js dependencies
└── README.md          # This file
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

For production:
```bash
npm start
```

For development (auto-restart on changes):
```bash
npm run dev
```

### 3. Open in Browser

Navigate to: `http://localhost:3001`

## Features

### Frontend
- **Modern HTML5** structure with semantic elements
- **Responsive CSS** with modern styling and animations
- **Interactive JavaScript** with API integration
- **Mobile-friendly** design that works on all devices

### Backend
- **Static file serving** for HTML, CSS, JS, and other assets
- **RESTful API** endpoints for data exchange
- **CORS enabled** for development
- **Error handling** with proper HTTP status codes
- **Security features** including directory traversal protection

## API Endpoints

- `GET /api/hello` - Simple greeting endpoint
- `GET /api/status` - Server status and information

Example API usage:
```javascript
fetch('/api/hello')
  .then(response => response.json())
  .then(data => console.log(data));
```

## Customization

### Adding New Pages
1. Create new HTML files in the project root
2. Link to them from `index.html`
3. The server will automatically serve them

### Adding New API Endpoints
1. Edit `server.js`
2. Add new cases in the `handleAPI` function
3. Test your endpoints

### Styling
- Edit `styles.css` for visual changes
- The CSS uses modern features like CSS Grid and Flexbox
- Responsive design breakpoints are included

### JavaScript Functionality
- Edit `script.js` for interactive features
- The code is modular and well-commented
- API functions are provided for easy expansion

## Development Tips

1. **Use browser developer tools** to debug frontend issues
2. **Check server console** for backend logs and errors
3. **Test API endpoints** using browser DevTools or Postman
4. **Use `npm run dev`** for automatic server restarts during development

## Next Steps

- Add more interactive features to the frontend
- Implement user authentication
- Add a database for data persistence
- Deploy to a cloud platform like Heroku or Netlify
- Add unit tests for both frontend and backend code
- Implement real-time features with WebSockets

## Troubleshooting

### Server won't start
- Check if port 3001 is already in use
- Ensure Node.js is installed (version 14+)
- Run `npm install` to install dependencies

### API not working
- Check browser console for errors
- Verify server is running on the correct port
- Check server console for error messages

### Styling issues
- Clear browser cache
- Check CSS syntax in `styles.css`
- Verify file paths are correct

Happy coding! 🚀
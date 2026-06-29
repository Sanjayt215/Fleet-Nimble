# FleetNimble Frontend Deployment Guide

## Vercel Deployment

### Environment Variables

Add the following environment variables in your Vercel project settings:

```
VITE_API_URL=https://fleet-nimble.onrender.com/api
VITE_SOCKET_URL=https://fleet-nimble.onrender.com
```

### Important Notes

- `VITE_API_URL` must include the `/api` suffix (e.g., `https://fleet-nimble.onrender.com/api`)
- `VITE_SOCKET_URL` should NOT include `/api` (e.g., `https://fleet-nimble.onrender.com`)
- These variables are required for the frontend to communicate with the backend

### Deployment Steps

1. Push code to GitHub
2. Connect Vercel to the GitHub repository
3. Configure environment variables in Vercel dashboard
4. Deploy

### Troubleshooting

If the AI chatbot returns 404 errors:
1. Verify `VITE_API_URL` is set correctly in Vercel
2. Ensure the URL includes `/api` at the end
3. Check that the backend is deployed and accessible
4. Test the backend directly: `POST https://fleet-nimble.onrender.com/api/ai/chat`

# Serves the prebuilt app (run `npm run build` first). Kept tiny so Cloud Build
# and Cloud Run use as few resources as possible.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 8080

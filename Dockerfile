# Multi-stage Dockerfile for Context Info App
# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Stage 2: Python backend with built frontend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY MapLayers ./MapLayers

# Copy static folder if it exists (optional)
COPY static ./static

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["python", "MapLayers/api.py"]

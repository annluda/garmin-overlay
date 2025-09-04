#!/bin/bash

# Stop and remove existing containers
docker-compose down

# Build and run the containers
docker-compose up --build -d

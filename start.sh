#!/bin/bash

# PM2 options
instances=2
script=server.js

if [ "$NODE_ENV" == "development" ]; then
   	exec npm start
else
   	# Start web server
   	cd /usr/src/app/ && pm2-docker -i $instances $script
fi
#!/bin/bash

# Simple polling daemon to periodically run auto_deploy.sh
# Default interval is 300 seconds (5 minutes)
INTERVAL=300

echo "[$(date)] Starting update polling daemon (interval: ${INTERVAL}s)..."

while true; do
    # Run the deployment script
    ./auto_deploy.sh
    
    # Wait for the next interval
    sleep "$INTERVAL"
done

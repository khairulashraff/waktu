#!/bin/bash

# Kill any existing instances of the app
killall waktu-react

# Run the app with the correct DISPLAY environment variable for X11 forwarding
export DISPLAY=":0"
./waktu-react --no-sandbox

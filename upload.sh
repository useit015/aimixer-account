#!/bin/bash

rsync -a --exclude "node_modules" . root@account.aimixer.io:/home/aimixer-account/

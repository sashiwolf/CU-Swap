#!/bin/bash

# DO NOT PUSH THIS FILE TO GITHUB
# This file contains sensitive information and should be kept private

# TODO: Set your PostgreSQL URI - Use the External Database URL from the Render dashboard
PG_URI="postgresql://users_db_zhyi_user:54TZI3R2pMDUDs5GWvlAsIcwcYed57rK@dpg-d4fl6c63jp1c73e099c0-a.oregon-postgres.render.com/users_db_zhyi"

# Execute each .sql file in the directory
for file in init_data/*.sql; do
    echo "Executing $file..."
    psql $PG_URI -f "$file"
done
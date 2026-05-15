-- 1. Create a dedicated space for Swetrix
CREATE DATABASE IF NOT EXISTS swetrix;

-- 2. Build the main analytics table (The Shelves)
CREATE TABLE IF NOT EXISTS swetrix.log (
    project_id String,
    timestamp DateTime,
    event_name String,
    path String,
    referrer String,
    browser String,
    os String,
    device_type String,
    country String,
    unique_visitor UInt8 
) ENGINE = MergeTree()
ORDER BY (project_id, timestamp);
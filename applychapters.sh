#! /bin/bash
# $1 is the path to the movie and metadata file
# $2 is the file name without extension
# $3 is the target name
/bin/ffmpeg -i $1/$2.mkv -i $1/metadata.txt -map_metadata 1 -codec copy $1/$2_$3_Full_Run.mkv

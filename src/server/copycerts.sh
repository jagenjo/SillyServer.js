echo Copying certs from /etc/letsencrypt/live
cp -v /etc/letsencrypt/live/tamats.com-0001/cert.pem ./server.crt 
cp -v /etc/letsencrypt/live/tamats.com-0001/privkey.pem ./server.key 
chown :www-data server.* 
chmod g+r server.* 
echo Done 

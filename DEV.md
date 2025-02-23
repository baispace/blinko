### run docker config for docker
```
docker-compose -f docker-compose.prod.yml up -d
```

## build docker with dockerfile locally
```
docker build -t blinko .
docker run --name blinko-website -d -p 1111:1111 blinko
```

## build docker image & run with docker-compose locally
```
docker-compose -f docker-compose.yml up -d --build
```


## run test docker
``` 
docker run -d \
  --name blinko-website \
  --network blinko-network \
  -p 1111:1111 \
  -e NODE_ENV=production \
  -v /volume1/docker/blinko/blinkodata:/app/.blinko \
  -e NEXTAUTH_SECRET=my_ultra_secure_nextauth_secret \
  -e DATABASE_URL=postgresql://postgres:mysecretpassword@blinko-postgres:5432/postgres \
  --restart always \
  blinkospace/blinko:fa46f26
```

# add @mastra/rag
```
pnpm add @mastra/rag --ignore-scripts
```

: "${API_KEY:?Set API_KEY before running this example}"
curl https://apis.itedus.cn/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer ${API_KEY}" -d '{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "1+1"
    }
  ]
}'
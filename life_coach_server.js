const http = require('http');
const https = require('https');

const API_KEY = 'sk-b68eabb77ffd4168b44b8df39d121499';
const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

// 验证API密钥格式
function validateApiKey(key) {
    return typeof key === 'string' && key.startsWith('sk-') && key.length > 20;
}

const server = http.createServer(async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 只处理/chat的POST请求
    if (req.method === 'POST' && req.url === '/chat') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { message } = JSON.parse(body);
                
                // 构建请求DeepSeek API的消息
                const messages = [
                    {
                        "role": "system",
                        "content": "你是一位专业的生活教练，擅长通过对话帮助人们发现并解决生活中的问题。你应该：\n1. 以同理心倾听用户的困扰\n2. 提供具体且可行的建议\n3. 鼓励用户积极面对挑战\n4. 帮助用户制定实际可行的目标\n5. 用温暖友善的语气交流"
                    },
                    {
                        "role": "user",
                        "content": message
                    }
                ];

                // 验证API密钥
                if (!validateApiKey(API_KEY)) {
                    throw new Error('Invalid API key format');
                }

                // 调用DeepSeek API
                const apiResponse = await new Promise((resolve, reject) => {
                    const apiReq = https.request(API_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${API_KEY}`
                        },
                        timeout: 60000 // 60秒超时
                    }, (apiRes) => {
                        let data = '';
                        let reply = '';

                        apiRes.on('data', (chunk) => {
                            data += chunk;
                            // 处理流式数据
                            try {
                                const lines = data.split('\n');
                                data = lines.pop(); // 保留最后一个可能不完整的行

                                for (const line of lines) {
                                    const trimmedLine = line.trim();
                                    if (trimmedLine === '' || trimmedLine === 'data: [DONE]') continue;
                                    
                                    // 确保行以'data: '开头
                                    if (!trimmedLine.startsWith('data: ')) continue;
                                    
                                    const jsonStr = trimmedLine.replace(/^data: /, '');
                                    try {
                                        const json = JSON.parse(jsonStr);
                                        if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                                            reply += json.choices[0].delta.content;
                                        }
                                    } catch (parseError) {
                                        console.error('Invalid JSON in stream:', jsonStr);
                                        continue;
                                    }
                                }
                            } catch (e) {
                                console.error('Error processing stream:', e);
                            }
                        });

                        apiRes.on('end', () => resolve(reply));
                    });

                    apiReq.on('error', reject);
                    apiReq.on('timeout', () => {
                        apiReq.destroy();
                        reject(new Error('Request timeout'));
                    });

                    apiReq.write(JSON.stringify({
                        model: 'deepseek-reasoner',
                        messages,
                        temperature: 0.6,
                        stream: true
                    }));
                    apiReq.end();
                });

                // 直接使用累积的回复内容
                const reply = apiResponse;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ reply }));

            } catch (error) {
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                });
                
                const errorMessage = error.message === 'Invalid API key format' 
                    ? 'API密钥格式无效' 
                    : '服务器内部错误';
                
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Life Coach Server is running on http://localhost:${PORT}`);
});
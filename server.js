const http = require('http');
const https = require('https');
const url = require('url');

const API_KEY = 'sk-b68eabb77ffd4168b44b8df39d121499';
const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

// 注意：请将上面的API_KEY替换为你的实际DeepSeek API密钥

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

    // 只处理/generate-names的POST请求
    if (req.method === 'POST' && req.url === '/generate-names') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { englishName } = JSON.parse(body);
                
                // 构建请求DeepSeek API的消息
                const messages = [
                    {
                        "role": "system",
                        "content": "你是一个专业的中文起名专家，擅长为外国人起富有创意和文化内涵的中文名。请根据用户提供的英文名，生成3个有趣的中文名，每个名字都要体现中国文化特色，并带有适当的幽默感。对每个名字都要提供中英文的寓意解释。"
                    },
                    {
                        "role": "user",
                        "content": `请为英文名"${englishName}"起3个中文名，格式要求：每个名字单独一组，包含：中文名字、中文寓意、英文寓意。注意名字要有趣、富有创意，可以适当加入一些梗或者双关语。`
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
                        apiRes.on('data', (chunk) => data += chunk);
                        apiRes.on('end', () => resolve(data));
                    });

                    apiReq.on('error', reject);
                    apiReq.on('timeout', () => {
                        apiReq.destroy();
                        reject(new Error('Request timeout'));
                    });

                    apiReq.write(JSON.stringify({
                        model: 'deepseek-reasoner',
                        messages,
                        temperature: 0.7,
                        max_tokens: 2000,
                        stream: false
                    }));
                    apiReq.end();
                });

                // 打印完整的API响应内容用于调试
                console.log('API Response:', apiResponse);

                // 解析API响应
                const apiData = JSON.parse(apiResponse);
                console.log('Parsed API Data:', JSON.stringify(apiData, null, 2));
                
                // 验证API响应数据的格式
                if (!apiData.choices || !Array.isArray(apiData.choices) || apiData.choices.length === 0 ||
                    !apiData.choices[0].message || !apiData.choices[0].message.content) {
                    console.error('API Response Format:', {
                        hasChoices: !!apiData.choices,
                        isChoicesArray: Array.isArray(apiData.choices),
                        choicesLength: apiData.choices ? apiData.choices.length : 0,
                        hasMessage: apiData.choices && apiData.choices[0] ? !!apiData.choices[0].message : false,
                        hasContent: apiData.choices && apiData.choices[0] && apiData.choices[0].message ? !!apiData.choices[0].message.content : false
                    });
                    throw new Error('Invalid API response format')
                }

                const generatedContent = apiData.choices[0].message.content;

                // 解析生成的内容，提取名字和解释
                const names = parseGeneratedNames(generatedContent);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ names }));

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

// 解析生成的名字内容
function parseGeneratedNames(content) {
    // 这里使用简单的解析逻辑，实际使用时可能需要根据API返回的具体格式调整
    const names = [];
    const nameGroups = content.split('\n\n').filter(group => group.trim());

    nameGroups.forEach(group => {
        const lines = group.split('\n');
        if (lines.length >= 3) {
            names.push({
                chinese: lines[0].replace(/^[\d\.]+\s*/, '').trim(),
                chineseMeaning: lines[1].replace(/中文寓意[：:]\s*/, '').trim(),
                englishMeaning: lines[2].replace(/英文寓意[：:]\s*/, '').trim()
            });
        }
    });

    return names;
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
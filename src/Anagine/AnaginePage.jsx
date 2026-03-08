import React, { useState, useEffect } from 'react';
import { Button, Input, Select, Card, message, Spin, Tabs, Row, Col } from 'antd';
// import './AnaginePage.less';
import AnagineExplorer from './AnagineExplorer.jsx';

const { TextArea } = Input;
const { Option } = Select;

const AnaginePage = () => {
    // state management
    const [loading, setLoading] = useState(false);
    const [anagineToken, setAnagineToken] = useState(null);
    const [loginError, setLoginError] = useState(null);
    const [kernel, setKernel] = useState('R');
    const [dataset, setDataset] = useState('ARDaC-AlcHepNet');

    // LLM related
    const [llmPrompt, setLlmPrompt] = useState('');
    const [llmHistory, setLlmHistory] = useState([]);

    // data analysis related
    const [filters, setFilters] = useState({ gender: 'F', age_at_index: '>40' });
    const [fetchedData, setFetchedData] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [corrResult, setCorrResult] = useState(null);

    // Anagine API base URL
    const ANAGINE_BASE = '/anagine';

    // auto login Anagine when component loads
    useEffect(() => {
        loginToAnagine();
    }, []);

    // login to Anagine
    const loginToAnagine = async () => {
        setLoading(true);
        setLoginError(null);
        try {
            const response = await fetch(`${ANAGINE_BASE}/login`, {
                method: 'POST',
                credentials: 'include',  // browser will automatically send cookies
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errMsg = data.error || data.hint || `HTTP ${response.status}`;
                throw new Error(errMsg);
            }

            setAnagineToken(data.token);
            message.success('Connected to Anagine');
        } catch (error) {
            const errMsg = error.message || 'Unknown error';
            setLoginError(errMsg);
            message.error(`Failed to connect to Anagine: ${errMsg}`);
        } finally {
            setLoading(false);
        }
    };

    // general API call
    const callAnagineAPI = async (endpoint, method = 'POST', body = null) => {
        if (!anagineToken) {
            message.error('Not connected to Anagine');
            return null;
        }

        try {
            const options = {
                method,
                headers: {
                    'Authorization': `Bearer ${anagineToken}`,
                    'Content-Type': 'application/json',
                },
            };

            if (body && method !== 'GET') {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(`${ANAGINE_BASE}${endpoint}`, options);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'API call failed');
            }

            return await response.json();
        } catch (error) {
            message.error(error.message);
            return null;
        }
    };

    // select kernel
    const handleSelectKernel = async (value) => {
        setKernel(value);
        const result = await callAnagineAPI('/select-kernel', 'POST', { kernel: value });
        if (result) {
            message.success(`Kernel set to ${value}`);
        }
    };

    // select dataset
    const handleSelectDataset = async (value) => {
        setDataset(value);
        const result = await callAnagineAPI('/select-dataset', 'POST', { dataset: value });
        if (result) {
            message.success(`Dataset set to ${value}`);
        }
    };

    // fetch data
    const handleFetchData = async () => {
        setLoading(true);
        // first set filters
        await callAnagineAPI('/filter', 'POST', { filters });
        // then fetch data
        const result = await callAnagineAPI('/fetch', 'POST', {});
        if (result) {
            setFetchedData(result);
            message.success(`Fetched ${result.count} records`);
        }
        setLoading(false);
    };

    // run analysis
    const handleAnalyze = async () => {
        setLoading(true);
        const result = await callAnagineAPI('/analyze', 'POST', {});
        if (result) {
            setAnalysisResult(result);
            message.success('Analysis completed');
        }
        setLoading(false);
    };

    // calculate correlation
    const handleCorrelation = async () => {
        setLoading(true);
        const result = await callAnagineAPI('/corr', 'POST', {});
        if (result) {
            setCorrResult(result);
            message.success('Correlation calculated');
        }
        setLoading(false);
    };

    // send LLM message
    const handleSendLLM = async () => {
        if (!llmPrompt.trim()) return;

        setLoading(true);
        const result = await callAnagineAPI('/llm', 'POST', { prompt: llmPrompt });

        if (result) {
            const newMessage = {
                role: 'user',
                content: llmPrompt,
            };
            const aiResponse = {
                role: 'assistant',
                content: result.text || result.message || 'No response',
            };

            setLlmHistory([...llmHistory, newMessage, aiResponse]);
            setLlmPrompt('');
        }
        setLoading(false);
    };

    // clear history
    const handleClearHistory = async () => {
        const result = await callAnagineAPI('/clear-history', 'POST', {});
        if (result) {
            setLlmHistory([]);
            message.success('History cleared');
        }
    };

    return (
        <div className="anagine-page">
            <div className="anagine-container">
                <h1>Anagine Analytics</h1>

                {!anagineToken ? (
                    <Card>
                        <Spin size="large" />
                        <p>{loginError ? `Connection failed: ${loginError}` : 'Connecting to Anagine...'}</p>
                        {loginError && (
                            <>
                                <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                                    Please verify: 1) Revproxy is configured for /anagine proxy 2) Anagine service is deployed 3) You are logged in to Gen3
                                </p>
                                <Button type="primary" onClick={loginToAnagine} style={{ marginTop: 12 }}>
                                    Retry connection
                                </Button>
                            </>
                        )}
                    </Card>
                ) : (
                    <Tabs 
                        defaultActiveKey="llm"
                        items={[
                            {
                                key: 'llm',
                                label: 'LLM Chat',
                                children: (
                                    <Card title="Chat with AI">
                                        <div className="llm-history">
                                            {llmHistory.map((msg, idx) => (
                                                <div key={idx} className={`message ${msg.role}`}>
                                                    <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong>
                                                    <p>{msg.content}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="llm-input">
                                            <TextArea
                                                value={llmPrompt}
                                                onChange={(e) => setLlmPrompt(e.target.value)}
                                                placeholder="Ask anything..."
                                                rows={3}
                                                onPressEnter={(e) => {
                                                    if (e.shiftKey) return;
                                                    e.preventDefault();
                                                    handleSendLLM();
                                                }}
                                            />
                                            <div style={{ marginTop: 10 }}>
                                                <Button type="primary" onClick={handleSendLLM} loading={loading}>
                                                    Send
                                                </Button>
                                                <Button onClick={handleClearHistory} style={{ marginLeft: 10 }}>
                                                    Clear History
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                ),
                            },
                            {
                                key: 'explorer',
                                label: 'Anagine Explorer',
                                children: <AnagineExplorer />,
                            },
                            {
                                key: 'analysis',
                                label: 'Data Analysis',
                                children: (
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Card title="Configuration">
                                                <div style={{ marginBottom: 15 }}>
                                                    <label>Kernel:</label>
                                                    <Select value={kernel} onChange={handleSelectKernel} style={{ width: '100%' }}>
                                                        <Option value="R">R</Option>
                                                        <Option value="PY">Python</Option>
                                                    </Select>
                                                </div>

                                                <div style={{ marginBottom: 15 }}>
                                                    <label>Dataset:</label>
                                                    <Select value={dataset} onChange={handleSelectDataset} style={{ width: '100%' }}>
                                                        <Option value="ARDaC-AlcHepNet">ARDaC-AlcHepNet</Option>
                                                    </Select>
                                                </div>

                                                <div style={{ marginBottom: 15 }}>
                                                    <label>Filters (JSON):</label>
                                                    <TextArea
                                                        value={JSON.stringify(filters, null, 2)}
                                                        onChange={(e) => {
                                                            try {
                                                                setFilters(JSON.parse(e.target.value));
                                                            } catch { }
                                                        }}
                                                        rows={4}
                                                    />
                                                </div>

                                                <Button type="primary" onClick={handleFetchData} loading={loading} block>
                                                    Fetch Data
                                                </Button>

                                                {fetchedData && (
                                                    <div style={{ marginTop: 15 }}>
                                                        <Button onClick={handleAnalyze} loading={loading} block>
                                                            Run Analysis
                                                        </Button>
                                                        <Button onClick={handleCorrelation} loading={loading} block style={{ marginTop: 10 }}>
                                                            Calculate Correlation
                                                        </Button>
                                                    </div>
                                                )}
                                            </Card>
                                        </Col>

                                        <Col span={12}>
                                            <Card title="Results">
                                                {fetchedData && (
                                                    <div>
                                                        <h4>Fetched Data ({fetchedData.count} records)</h4>
                                                        <pre>{JSON.stringify(fetchedData.sample, null, 2)}</pre>
                                                    </div>
                                                )}

                                                {analysisResult && (
                                                    <div>
                                                        <h4>Analysis Result</h4>
                                                        <pre>{JSON.stringify(analysisResult, null, 2)}</pre>
                                                    </div>
                                                )}

                                                {corrResult && (
                                                    <div>
                                                        <h4>Correlation Result</h4>
                                                        <pre>{JSON.stringify(corrResult, null, 2)}</pre>
                                                    </div>
                                                )}
                                            </Card>
                                        </Col>
                                    </Row>
                                ),
                            },
                        ]}
                    />
                )}
            </div>
        </div>
    );
};

export default AnaginePage;
import React, { useState } from 'react';
import { Card, Button, Table, Tag, Progress, Alert, Space, Divider } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { guppyGraphQLUrl } from '../localconf';
import { fetchWithCreds } from '../actions';

const AnagineTestPanel = () => {
  const [testResults, setTestResults] = useState([]);
  const [testing, setTesting] = useState(false);
  const [currentTest, setCurrentTest] = useState('');
  const [progress, setProgress] = useState(0);
  const [anagineToken, setAnagineToken] = useState(null);

  const ANAGINE_BASE = '/anagine';
  const GUPPY_GRAPHQL_URL = guppyGraphQLUrl;

  // test filters
  const TEST_SCENARIOS = [
    {
      name: '空过滤器 - 获取所有数据',
      filters: {},
      description: '不应用任何过滤条件'
    },
    {
      name: '单一过滤器 - 性别',
      filters: { gender: 'F' },
      description: '只筛选女性数据'
    },
    {
      name: '多重过滤器 - 性别+年龄',
      filters: { gender: 'F', age_at_index: '>40' },
      description: '女性且年龄大于40'
    },
    {
      name: '复杂过滤器',
      filters: { gender: 'M', age_at_index: '<30', race: 'White' },
      description: '男性、年龄小于30、白种人'
    }
  ];

  // convert Anagine filters to Guppy filters
  const convertToGuppyFilter = (filters) => {
    if (!filters || Object.keys(filters).length === 0) {
      return null;
    }

    const gqlFilter = { AND: [] };

    Object.entries(filters).forEach(([field, value]) => {
      if (typeof value === 'string' && value.startsWith('>')) {
        // 处理 >40 这样的格式
        const numValue = parseFloat(value.substring(1));
        gqlFilter.AND.push({ '>': { [field]: numValue } });
      } else if (typeof value === 'string' && value.startsWith('<')) {
        // 处理 <30 这样的格式
        const numValue = parseFloat(value.substring(1));
        gqlFilter.AND.push({ '<': { [field]: numValue } });
      } else {
        // 精确匹配
        gqlFilter.AND.push({ '=': { [field]: value } });
      }
    });

    return gqlFilter.AND.length > 0 ? gqlFilter : null;
  };

  // 工具函数：测试单个 Anagine 端点
  const testAnagineEndpoint = async (endpoint, method = 'POST', body = null) => {
    const startTime = performance.now();
    
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
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          responseTime,
          error: error.error || 'Request failed',
          data: null
        };
      }
      
      const data = await response.json();
      return {
        success: true,
        responseTime,
        error: null,
        data
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        responseTime: Math.round(endTime - startTime),
        error: error.message,
        data: null
      };
    }
  };

  // 工具函数：测试 Guppy
  const testGuppyQuery = async (filters) => {
    const startTime = performance.now();
    
    try {
      const gqlFilter = convertToGuppyFilter(filters);
      const fields = ['gender', 'age_at_index', 'race', 'ethnicity'];
      
      // 构建 GraphQL 查询
      const query = `
        query ${gqlFilter ? '($filter: JSON)' : ''} {
          case ${gqlFilter ? '(filter: $filter, first: 20, accessibility: all)' : '(first: 20, accessibility: all)'} {
            ${fields.join('\n            ')}
          }
          _aggregation {
            case ${gqlFilter ? '(filter: $filter, accessibility: all)' : '(accessibility: all)'} {
              _totalCount
            }
          }
        }
      `;

      const variables = gqlFilter ? { filter: gqlFilter } : {};

      const response = await fetchWithCreds({
        path: GUPPY_GRAPHQL_URL,
        method: 'POST',
        body: JSON.stringify({ query, variables }),
      });

      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      if (!response || !response.data) {
        return {
          success: false,
          responseTime,
          error: 'No data returned from Guppy',
          data: null,
          count: 0
        };
      }

      const totalCount = response.data._aggregation?.case?._totalCount || 0;
      const cases = response.data.case || [];
      
      return {
        success: true,
        responseTime,
        error: null,
        data: cases,
        count: totalCount
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        responseTime: Math.round(endTime - startTime),
        error: error.message || 'Guppy query failed',
        data: null,
        count: 0
      };
    }
  };

  // 主测试流程
  const runFullTest = async () => {
    setTesting(true);
    setTestResults([]);
    setProgress(0);
    
    const results = [];
    const totalTests = TEST_SCENARIOS.length * 2 + 2; // Anagine + Guppy + 2个基础测试
    let completedTests = 0;

    // ========== 测试 1: Anagine 登录 ==========
    setCurrentTest('🔐 测试 Anagine 登录...');
    const loginResult = await testAnagineEndpoint('/login', 'POST', {
      username: 'user1',
      password: '1234'
    });

    results.push({
      test: 'Anagine 登录',
      system: 'Anagine',
      success: loginResult.success,
      responseTime: loginResult.responseTime,
      error: loginResult.error,
      details: loginResult.success ? '✅ 获得 Token' : '❌ 登录失败'
    });

    if (loginResult.success) {
      setAnagineToken(loginResult.data.token);
    } else {
      setTesting(false);
      setTestResults(results);
      return;
    }

    completedTests++;
    setProgress(Math.round((completedTests / totalTests) * 100));

    // ========== 测试 2: 选择内核和数据集 ==========
    setCurrentTest('⚙️ 配置 Anagine 环境...');
    await testAnagineEndpoint('/select-kernel', 'POST', { kernel: 'R' });
    await testAnagineEndpoint('/select-dataset', 'POST', { dataset: 'ARDaC-AlcHepNet' });
    
    completedTests++;
    setProgress(Math.round((completedTests / totalTests) * 100));

    // ========== 测试 3-N: 运行各种过滤场景 ==========
    for (const scenario of TEST_SCENARIOS) {
      setCurrentTest(`📊 测试场景: ${scenario.name}`);

      // --- Anagine 测试 ---
      const anagineFilterResult = await testAnagineEndpoint('/filter', 'POST', { 
        filters: scenario.filters 
      });
      const anagineFetchResult = await testAnagineEndpoint('/fetch', 'POST', {});

      const anagineTotalTime = anagineFilterResult.responseTime + anagineFetchResult.responseTime;
      
      results.push({
        test: scenario.name,
        system: 'Anagine',
        success: anagineFetchResult.success,
        responseTime: anagineTotalTime,
        count: anagineFetchResult.data?.count || 0,
        error: anagineFetchResult.error,
        filters: JSON.stringify(scenario.filters),
        description: scenario.description,
        sample: anagineFetchResult.data?.sample?.[0] || null
      });

      completedTests++;
      setProgress(Math.round((completedTests / totalTests) * 100));

      // --- Guppy 测试 ---
      const guppyResult = await testGuppyQuery(scenario.filters);

      results.push({
        test: scenario.name,
        system: 'Guppy',
        success: guppyResult.success,
        responseTime: guppyResult.responseTime,
        count: guppyResult.count,
        error: guppyResult.error,
        filters: JSON.stringify(scenario.filters),
        description: scenario.description,
        sample: guppyResult.data?.[0] || null
      });

      completedTests++;
      setProgress(Math.round((completedTests / totalTests) * 100));
    }

    setCurrentTest('✅ 测试完成！');
    setTestResults(results);
    setTesting(false);
    setProgress(100);
  };

  // 生成对比摘要
  const generateSummary = () => {
    if (testResults.length === 0) return null;

    const anagineResults = testResults.filter(r => r.system === 'Anagine' && r.test !== 'Anagine 登录');
    const guppyResults = testResults.filter(r => r.system === 'Guppy');

    if (anagineResults.length === 0 || guppyResults.length === 0) return null;

    const anagineAvgTime = Math.round(
      anagineResults.reduce((sum, r) => sum + r.responseTime, 0) / anagineResults.length
    );
    const guppyAvgTime = Math.round(
      guppyResults.reduce((sum, r) => sum + r.responseTime, 0) / guppyResults.length
    );

    const anagineSuccessRate = (anagineResults.filter(r => r.success).length / anagineResults.length * 100).toFixed(1);
    const guppySuccessRate = (guppyResults.filter(r => r.success).length / guppyResults.length * 100).toFixed(1);

    return {
      anagineAvgTime,
      guppyAvgTime,
      anagineSuccessRate,
      guppySuccessRate,
      faster: anagineAvgTime < guppyAvgTime ? 'Anagine' : 'Guppy',
      speedDiff: Math.abs(anagineAvgTime - guppyAvgTime)
    };
  };

  const summary = generateSummary();

  // 表格列定义
  const columns = [
    {
      title: '测试场景',
      dataIndex: 'test',
      key: 'test',
      width: 200,
    },
    {
      title: '系统',
      dataIndex: 'system',
      key: 'system',
      width: 100,
      render: (system) => (
        <Tag color={system === 'Anagine' ? 'blue' : 'green'}>{system}</Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'success',
      key: 'success',
      width: 80,
      render: (success) => (
        success ? 
          <CheckCircleOutlined style={{ color: 'green', fontSize: 20 }} /> : 
          <CloseCircleOutlined style={{ color: 'red', fontSize: 20 }} />
      )
    },
    {
      title: '响应时间 (ms)',
      dataIndex: 'responseTime',
      key: 'responseTime',
      width: 120,
      sorter: (a, b) => a.responseTime - b.responseTime,
      render: (time) => (
        <span style={{ fontWeight: 'bold', color: time < 500 ? 'green' : time < 1000 ? 'orange' : 'red' }}>
          {time} ms
        </span>
      )
    },
    {
      title: '数据量',
      dataIndex: 'count',
      key: 'count',
      width: 100,
    },
    {
      title: '过滤条件',
      dataIndex: 'filters',
      key: 'filters',
      width: 200,
      ellipsis: true,
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      width: 150,
      render: (error) => error ? <Tag color="red">{error}</Tag> : '-'
    }
  ];

  // 下载测试报告
  const downloadReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      summary,
      testResults,
      environment: {
        anagineBase: ANAGINE_BASE,
        guppyGraphQLUrl: GUPPY_GRAPHQL_URL
      }
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anagine-test-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title="🧪 Anagine vs Guppy 性能测试" extra={
        <Space>
          <Button 
            type="primary" 
            onClick={runFullTest} 
            loading={testing}
            size="large"
          >
            {testing ? '测试中...' : '开始测试'}
          </Button>
          {testResults.length > 0 && (
            <Button onClick={downloadReport}>下载报告</Button>
          )}
        </Space>
      }>
        {testing && (
          <div style={{ marginBottom: 20 }}>
            <Alert 
              message={currentTest} 
              type="info" 
              icon={<LoadingOutlined />}
              showIcon
            />
            <Progress percent={progress} status="active" style={{ marginTop: 10 }} />
          </div>
        )}

        {summary && (
          <>
            <Alert
              message="测试摘要"
              description={
                <div>
                  <p><strong>平均响应时间：</strong> Anagine: {summary.anagineAvgTime}ms | Guppy: {summary.guppyAvgTime}ms</p>
                  <p><strong>成功率：</strong> Anagine: {summary.anagineSuccessRate}% | Guppy: {summary.guppySuccessRate}%</p>
                  <p><strong>性能对比：</strong> 
                    <Tag color={summary.faster === 'Anagine' ? 'blue' : 'green'}>
                      {summary.faster} 更快 ({summary.speedDiff}ms)
                    </Tag>
                  </p>
                </div>
              }
              type="success"
              style={{ marginBottom: 20 }}
            />
          </>
        )}

        <Divider />

        <Table 
          columns={columns}
          dataSource={testResults}
          rowKey={(record, index) => `${record.system}-${record.test}-${index}`}
          pagination={false}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
};

export default AnagineTestPanel;
import React, { useState, useEffect } from 'react';
import { Button } from 'antd';
import { getAllFieldsFromGuppy } from '@gen3/guppy/dist/components/Utils/queries';
import { explorerConfig, guppyUrl } from '../localconf'; 

const DEBUG = process.env.NODE_ENV === 'development';
const EXPLORER_FILTER_KEY = 'guppy_explorer_filters';

const AnagineExplorer = () => {
  const [anagineToken, setAnagineToken] = useState(null);
  const [anagineData, setAnagineData] = useState(null);
  const [dataSource, setDataSource] = useState('guppy'); // 'guppy' or 'memory'
  const [currentFilter, setCurrentFilter] = useState({});
  const [explorerFilter, setExplorerFilter] = useState(null);
  const [availableFields, setAvailableFields] = useState([]);

  const dataType = explorerConfig[0]?.guppyConfig?.dataType || 'subject';

  if (DEBUG) console.log('Using dataType:', dataType);

  // login to Anagine
  useEffect(() => {
    fetch('/anagine/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',  // browser will automatically send cookies
      body: JSON.stringify({})
    })
      .then(r => {
        if (!r.ok) {
          throw new Error(`Login failed: ${r.status}`);
        }
        return r.json();
      })
      .then(data => setAnagineToken(data.token))
      .catch(error => {
        console.error('Anagine login error:', error);
      });
  }, []);

  useEffect(() => {
    if (DEBUG) console.log('Fetching available fields for type:', dataType);
    getAllFieldsFromGuppy(guppyUrl, dataType)
      .then(fields => {
        if (DEBUG) console.log('Available fields:', fields);
        setAvailableFields(fields);
      })
      .catch(error => {
        console.error('Error fetching fields:', error);
      });
  }, [dataType]);

  // Try to load filters from localStorage when component mounts
  useEffect(() => {
    const loadExplorerFilters = () => {
      try {
        const savedFilters = localStorage.getItem(EXPLORER_FILTER_KEY);
        if (savedFilters) {
          const filters = JSON.parse(savedFilters);
          if (DEBUG) console.log('Loaded filters from localStorage:', filters);
          setExplorerFilter(filters);
        }
      } catch (error) {
        console.error('Error loading filters from localStorage:', error);
      }
    };

    loadExplorerFilters();

    // Listen for storage changes (when filters updated in another tab)
    const handleStorageChange = (e) => {
      if (e.key === EXPLORER_FILTER_KEY && e.newValue) {
        try {
          const filters = JSON.parse(e.newValue);
          if (DEBUG) console.log('Filters updated from another tab:', filters);
          setExplorerFilter(filters);
        } catch (error) {
          console.error('Error parsing filter update:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Query Anagine with given filters
  const queryAnagine = async (filter) => {
    if (!anagineToken) {
      if (DEBUG) console.log('Waiting for Anagine token...');
      return;
    }
  
    try {
      if (DEBUG) console.log('Querying Anagine with filters:', filter);
      if (DEBUG) console.log('Using dataType:', dataType);
      if (DEBUG) console.log('Available fields count:', availableFields.length);
      
      // verify filter fields exist
      const filterFields = Object.keys(filter);
      const validFilterFields = filterFields.filter(f => availableFields.includes(f));
      
      if (filterFields.length > validFilterFields.length) {
        const invalidFields = filterFields.filter(f => !availableFields.includes(f));
        if (DEBUG) console.warn('Some filter fields are not available:', invalidFields);
      }
      
      // let backend decide which fields to query
      const queryFields = [];
      
      if (DEBUG) console.log('Query fields:', queryFields);
      
      const response = await fetch('/anagine/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anagineToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dataSource,
          index: dataType,  // ← read from config, not hardcoded
          filters: filter,
          fields: queryFields,  // ← use real available fields
          first: 100
        })
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Query failed: ${response.status} - ${errorText}`);
      }
  
      const result = await response.json();
      setAnagineData(result);
      setCurrentFilter(filter);
    } catch (error) {
      console.error('Query error:', error);
      alert('Query failed: ' + error.message);
    }
  };

  // Use filters from Explorer
  const handleUseExplorerFilters = () => {
    if (explorerFilter) {
      queryAnagine(explorerFilter);
    }
  };

  return (
    <div className="anagine-explorer" style={{ padding: '20px' }}>
      <h2>Anagine Explorer</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Query data through Anagine using filters from the main Explorer page
      </p>
      
      {/* Connection status */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: anagineToken ? '#d4edda' : '#fff3cd', borderRadius: '4px' }}>
        <strong>Status:</strong> {anagineToken ? '✓ Connected to Anagine' : '⏳ Connecting...'}
      </div>

      {/* data source switcher */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
        <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Data Source:</label>
        <select 
          value={dataSource} 
          onChange={(e) => {
            setDataSource(e.target.value);
            // Re-query with new data source if we have filters
            if (anagineToken && Object.keys(currentFilter).length > 0) {
              queryAnagine(currentFilter);
            }
          }}
          style={{ padding: '5px 10px', fontSize: '14px' }}
        >
          <option value="guppy">Guppy (real-time query)</option>
          <option value="memory">Memory (pre-loaded)</option>
        </select>
        <span style={{ marginLeft: '10px', color: '#666', fontSize: '13px' }}>
          Switch between real-time Guppy queries or pre-loaded in-memory data
        </span>
      </div>

      {/* Import filters from Explorer */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #17a2b8', borderRadius: '4px', backgroundColor: '#e7f6f8' }}>
        <h3 style={{ marginTop: 0 }}>Import Filters from Explorer</h3>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
          Go to <a href="/explorer" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>/explorer</a> page, select your filters, then come back here and click "Use Explorer Filters".
        </p>
        
        {explorerFilter ? (
          <div>
            <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
              <strong>Available Filters from Explorer:</strong>
              <pre style={{ marginTop: '10px', fontSize: '12px', maxHeight: '200px', overflow: 'auto' }}>
                {JSON.stringify(explorerFilter, null, 2)}
              </pre>
            </div>
            <Button 
              type="primary" 
              onClick={handleUseExplorerFilters}
              disabled={!anagineToken}
              style={{ marginRight: '10px' }}
            >
              Use Explorer Filters
            </Button>
            <Button 
              onClick={() => {
                localStorage.removeItem(EXPLORER_FILTER_KEY);
                setExplorerFilter(null);
              }}
            >
              Clear Saved Filters
            </Button>
          </div>
        ) : (
          <div style={{ padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
            <p style={{ margin: 0 }}>
              ℹ️ No filters found. Please go to the <a href="/explorer" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>/explorer</a> page and select some filters first.
            </p>
          </div>
        )}
      </div>

      {/* Display current active filters */}
      {Object.keys(currentFilter).length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #007bff', borderRadius: '4px', backgroundColor: '#e7f3ff' }}>
          <h3 style={{ marginTop: 0 }}>Active Query Filters</h3>
          <pre style={{ fontSize: '13px', margin: 0, maxHeight: '200px', overflow: 'auto' }}>
            {JSON.stringify(currentFilter, null, 2)}
          </pre>
        </div>
      )}

      {/* display Anagine results */}
      {anagineData && (
        <div className="anagine-results" style={{ marginTop: '20px', padding: '15px', border: '1px solid #28a745', borderRadius: '4px', backgroundColor: '#f8fff8' }}>
          <h3 style={{ marginTop: 0 }}>Query Results from Anagine</h3>
          <p><strong>Data Source:</strong> {anagineData.source}</p>
          <p><strong>Total Count:</strong> {anagineData.totalCount}</p>
          <details open>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px' }}>
              Sample Data (first 3 records)
            </summary>
            <pre style={{ maxHeight: '400px', overflow: 'auto', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px', fontSize: '12px' }}>
              {JSON.stringify(anagineData.data?.slice(0, 3), null, 2)}
            </pre>
          </details>
        </div>
      )}

      {!anagineData && anagineToken && Object.keys(currentFilter).length === 0 && (
        <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f9f9f9', textAlign: 'center', color: '#666' }}>
          👆 Import and use filters from Explorer to query data
        </div>
      )}
    </div>
  );
};

export default AnagineExplorer;
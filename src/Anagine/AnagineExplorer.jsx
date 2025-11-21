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
  const [activeDataType, setActiveDataType] = useState(null);
  
  // Use ref to always get the latest availableFields
  const availableFieldsRef = React.useRef(availableFields);
  React.useEffect(() => {
    availableFieldsRef.current = availableFields;
  }, [availableFields]);

  // Use dataType from explorer state if available, otherwise use default from config
  const dataType = activeDataType || explorerConfig[0]?.guppyConfig?.dataType || 'subject';
  
  // Use ref to always get the latest dataType
  const dataTypeRef = React.useRef(dataType);
  React.useEffect(() => {
    dataTypeRef.current = dataType;
  }, [dataType]);

  // Find the matching explorerConfig for the current dataType
  const currentExplorerConfig = explorerConfig.find(
    config => config.guppyConfig?.dataType === dataType
  );

  if (DEBUG) console.log('Using dataType:', dataType, '(from explorer:', activeDataType !== null, ')');
  if (DEBUG) console.log('Current explorer config:', currentExplorerConfig);

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
    // Reset availableFields when dataType changes
    setAvailableFields([]);
    
    console.log('Fetching available fields for type:', dataType, 'from:', guppyUrl);
    getAllFieldsFromGuppy(guppyUrl, dataType)
      .then(fields => {
        console.log('Loaded', fields.length, 'fields for', dataType, ':', fields);
        setAvailableFields(fields);
      })
      .catch(error => {
        console.error('Error fetching fields for', dataType, ':', error);
        setAvailableFields([]);
      });
  }, [dataType]);

  // Try to load complete explorer state from localStorage when component mounts
  useEffect(() => {
    const loadExplorerState = () => {
      try {
        const savedData = localStorage.getItem(EXPLORER_FILTER_KEY);
        if (savedData) {
          const explorerState = JSON.parse(savedData);
          if (DEBUG) console.log('Loaded explorer state from localStorage:', explorerState);

          // Check if it's the new format (with guppyConfig)
          if (explorerState.filter && explorerState.guppyConfig) {
            setExplorerFilter(explorerState.filter);
            setActiveDataType(explorerState.guppyConfig.dataType);
            if (DEBUG) console.log('Using dataType from explorer:', explorerState.guppyConfig.dataType);
          } else {
            // Backward compatibility: old format (just the filter object)
            setExplorerFilter(explorerState);
            if (DEBUG) console.log('Using old filter format, dataType will be from config');
          }
        }
      } catch (error) {
        console.error('Error loading explorer state from localStorage:', error);
      }
    };

    loadExplorerState();

    // Listen for storage changes (when filters updated in another tab)
    const handleStorageChange = (e) => {
      if (e.key === EXPLORER_FILTER_KEY && e.newValue) {
        try {
          const explorerState = JSON.parse(e.newValue);
          if (DEBUG) console.log('Explorer state updated from another tab:', explorerState);

          // Check if it's the new format (with guppyConfig)
          if (explorerState.filter && explorerState.guppyConfig) {
            setExplorerFilter(explorerState.filter);
            setActiveDataType(explorerState.guppyConfig.dataType);
          } else {
            // Backward compatibility: old format
            setExplorerFilter(explorerState);
          }
        } catch (error) {
          console.error('Error parsing explorer state update:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Query Anagine with given filters
  const queryAnagine = async (filter, fieldsToUse = null) => {
    if (!anagineToken) {
      if (DEBUG) console.log('Waiting for Anagine token...');
      return;
    }

    // Use refs to get the latest values (solves closure issue)
    const currentDataType = dataTypeRef.current;
    const currentFields = fieldsToUse || availableFieldsRef.current;
    
    // Wait for availableFields to load before querying
    if (currentFields.length === 0) {
      console.warn('Available fields not loaded yet, skipping query');
      return;
    }

    try {
      if (DEBUG) console.log('Querying Anagine with filters:', filter);
      if (DEBUG) console.log('Using dataType:', currentDataType);
      if (DEBUG) console.log('Available fields count:', currentFields.length);

      // No filter validation - pass filters as-is to backend, just like GuppyWrapper does
      // Guppy GraphQL will handle non-existent fields (they will be ignored)
      console.log('Sending query with:', { dataType: currentDataType, filter });

      // Get table fields from explorerConfig for the current dataType
      const currentConfig = explorerConfig.find(
        config => config.guppyConfig?.dataType === currentDataType
      );
      const configTableFields = currentConfig?.table?.fields || [];
      console.log('========================================');
      console.log('Table fields from config:', configTableFields);
      console.log('Config has', configTableFields.length, 'fields');
      console.log('Guppy has', currentFields.length, 'available fields');
      
      // Filter config table fields to only include those available in Guppy
      const validTableFields = configTableFields.filter(f => currentFields.includes(f));
      const invalidTableFields = configTableFields.filter(f => !currentFields.includes(f));
      
      console.log('VALID fields (in both config and Guppy):', validTableFields);
      console.log('VALID count:', validTableFields.length);
      
      if (invalidTableFields.length > 0) {
        console.error('INVALID fields (in config but NOT in Guppy):', invalidTableFields);
        console.error('INVALID count:', invalidTableFields.length);
        console.error('These fields will cause GraphQL errors!');
      }
      console.log('========================================');
      
      // If no valid fields from config, fallback to some available fields
      let queryFields;
      if (validTableFields.length > 0) {
        queryFields = validTableFields;
        console.log('Using', validTableFields.length, 'of', configTableFields.length, 'table config fields');
      } else {
        // Fallback: use first 15 available fields
        queryFields = currentFields.slice(0, 15);
        console.log('No table config fields available, using first', queryFields.length, 'available fields');
      }

      console.log('Selected query fields:', queryFields);

      const requestBody = {
        dataSource,
        index: currentDataType,
        filters: filter,  // ← Pass original filter as-is, no validation/cleaning
        fields: queryFields,
        first: 100
      };
      
      console.log('Full request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('/anagine/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anagineToken}`,
        'Content-Type': 'application/json'
      },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Query failed: ${response.status} - ${errorText}`);
      }

    const result = await response.json();
    setAnagineData(result);
      setCurrentFilter(filter);  // Save the filter used for querying
    } catch (error) {
      console.error('Query error:', error);
      alert('Query failed: ' + error.message);
    }
  };

  // Use filters from Explorer
  const handleUseExplorerFilters = () => {
    if (explorerFilter) {
      // Use ref to get the latest availableFields
      const latestFields = availableFieldsRef.current;
      console.log('Button clicked, using', latestFields.length, 'fields for', dataType);
      queryAnagine(explorerFilter, latestFields);
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
        <strong>Status:</strong> {anagineToken ? 'Connected to Anagine' : 'Connecting...'}
      </div>

      {/* Data Type Info */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
        <div>
          <strong>Active Data Type:</strong> <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '3px', fontWeight: 'bold' }}>{dataType}</code>
          {activeDataType && (
            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
              (synced from Explorer)
            </span>
          )}
          {!activeDataType && (
            <span style={{ marginLeft: '10px', fontSize: '12px', color: '#999' }}>
              (using default from config)
            </span>
          )}
        </div>
        {currentExplorerConfig?.table?.fields && (
          <div style={{ marginTop: '8px', fontSize: '13px', color: '#555' }}>
            <strong>Configured Table Fields:</strong> {currentExplorerConfig.table.fields.length} fields
            <span style={{ marginLeft: '10px', color: '#888' }}>
              ({currentExplorerConfig.table.fields.slice(0, 5).join(', ')}
              {currentExplorerConfig.table.fields.length > 5 ? ', ...' : ''})
            </span>
          </div>
        )}
      </div>

      {/* data source switcher */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
        <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Data Source:</label>
        <select
          value={dataSource}
          onChange={(e) => {
            setDataSource(e.target.value);
            // Re-query with new data source if we have filters
            // Use ref to get the latest availableFields
            const latestFields = availableFieldsRef.current;
            if (anagineToken && latestFields.length > 0 && Object.keys(currentFilter).length > 0) {
              queryAnagine(currentFilter, latestFields);
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
              disabled={!anagineToken || availableFields.length === 0}
              style={{ marginRight: '10px' }}
            >
              Use Explorer Filters
            </Button>
            {availableFields.length === 0 && anagineToken && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
                Loading available fields for <code>{dataType}</code>...
              </div>
            )}
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
              No filters found. Please go to the <a href="/explorer" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>/explorer</a> page and select some filters first.
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
          Import and use filters from Explorer to query data
        </div>
      )}
    </div>
  );
};

export default AnagineExplorer;
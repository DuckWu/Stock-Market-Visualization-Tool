// Environment configuration
const dev = {
  apiUrl: 'http://localhost:3002',
  apiHeaders: {
    'Origin': 'http://localhost:3000'
  }
};

const prod = {
  apiUrl: 'http://3.148.170.36:3002',
  apiHeaders: {
    'Origin': 'http://3.148.170.36:3000'
  }
};

// Choose the right environment
const config = process.env.NODE_ENV === 'production' ? prod : dev;

export default config; 
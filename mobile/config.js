import { Platform } from 'react-native';

// Use 192.168.0.59 for physical device on the same network
const API_HOST = '192.168.0.59:8000';

export const API_URL = `http://${API_HOST}`;
export const WS_URL = `ws://${API_HOST}`;

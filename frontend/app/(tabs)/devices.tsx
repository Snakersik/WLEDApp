import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useLanguage } from '../../src/context/LanguageContext';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { WLEDService } from '../../src/services/wledService';
import { WLEDDiscovery, DiscoveredDevice } from '../../src/services/discoveryService';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

type AddMode = 'select' | 'scan' | 'setup' | 'manual';
type SetupStep = 1 | 2 | 3 | 4;

interface Device {
  id: string;
  name: string;
  ip_address: string;
  led_count: number;
  is_online: boolean;
  created_at: string;
}

export default function DevicesScreen() {
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  
  // Add mode states
  const [addMode, setAddMode] = useState<AddMode>('select');
  const [scanning, setScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  
  // Manual mode states
  const [deviceName, setDeviceName] = useState('');
  const [deviceIP, setDeviceIP] = useState('');
  const [deviceLEDCount, setDeviceLEDCount] = useState('119');
  const [adding, setAdding] = useState(false);
  
  // Setup mode states
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [setupProgress, setSetupProgress] = useState('');

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_URL}/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Check online status for each device
      const devicesWithStatus = await Promise.all(
        response.data.map(async (device: Device) => {
          const isOnline = await WLEDService.isOnline(device.ip_address);
          return { ...device, is_online: isOnline };
        })
      );
      
      setDevices(devicesWithStatus);
    } catch (error: any) {
      console.error('Failed to fetch devices:', error);
      Alert.alert(t('error'), t('failedToLoad'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDevices();
  };

  const handleAddDevice = async () => {
    if (!deviceName || !deviceIP) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setAdding(true);
    try {
      const response = await axios.post(
        `${API_URL}/devices`,
        {
          name: deviceName,
          ip_address: deviceIP,
          led_count: parseInt(deviceLEDCount) || 119,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      // Check if device is actually online
      const isOnline = await WLEDService.isOnline(deviceIP);
      const newDevice = { ...response.data, is_online: isOnline };
      
      setDevices([...devices, newDevice]);
      setModalVisible(false);
      setDeviceName('');
      setDeviceIP('');
      setDeviceLEDCount('119');
      Alert.alert(t('success'), t('deviceAdded'));
    } catch (error: any) {
      console.error('Failed to add device:', error);
      Alert.alert(t('error'), error.response?.data?.detail || t('failedToLoad'));
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteDevice = (deviceId: string, deviceName: string) => {
    Alert.alert(
      t('deleteDevice'),
      `${t('deleteDeviceConfirm')} "${deviceName}"?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/devices/${deviceId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setDevices(devices.filter(d => d.id !== deviceId));
              Alert.alert(t('success'), t('deviceDeleted'));
            } catch (error: any) {
              Alert.alert(t('error'), t('failedToLoad'));
            }
          },
        },
      ]
    );
  };

  // ============ AUTO-DISCOVERY FUNCTIONS ============

  const resetModal = () => {
    setAddMode('select');
    setScanning(false);
    setDiscoveredDevices([]);
    setDeviceName('');
    setDeviceIP('');
    setDeviceLEDCount('119');
    setSetupStep(1);
    setWifiSSID('');
    setWifiPassword('');
    setSetupProgress('');
    WLEDDiscovery.stopMDNSScan();
  };

  const openAddModal = () => {
    resetModal();
    setModalVisible(true);
  };

  const closeModal = () => {
    resetModal();
    setModalVisible(false);
  };

  // mDNS Network Scan
  const startMDNSScan = () => {
    setAddMode('scan');
    setScanning(true);
    setDiscoveredDevices([]);
    
    WLEDDiscovery.startMDNSScan(
      (device) => {
        console.log('Device found:', device);
        setDiscoveredDevices(prev => {
          // Avoid duplicates
          if (prev.find(d => d.ip === device.ip)) return prev;
          return [...prev, device];
        });
      },
      () => {
        console.log('Scan completed');
        setScanning(false);
      }
    );
  };

  const addDiscoveredDevice = async (device: DiscoveredDevice) => {
    setAdding(true);
    try {
      const response = await axios.post(
        `${API_URL}/devices`,
        {
          name: device.name,
          ip_address: device.ip,
          led_count: 119,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const isOnline = await WLEDService.isOnline(device.ip);
      const newDevice = { ...response.data, is_online: isOnline };
      
      setDevices([...devices, newDevice]);
      closeModal();
      Alert.alert(t('success'), t('deviceAdded'));
    } catch (error: any) {
      Alert.alert(t('error'), error.response?.data?.detail || t('failedToLoad'));
    } finally {
      setAdding(false);
    }
  };

  // Setup Mode (WLED-AP)
  const startSetupMode = () => {
    setAddMode('setup');
    setSetupStep(1);
  };

  const checkAPConnection = async () => {
    setAdding(true);
    const result = await WLEDDiscovery.checkAPConnection();
    setAdding(false);
    
    if (result.success) {
      setSetupStep(3);
    } else {
      Alert.alert(t('notConnectedToAP'), t('checkConnection'));
    }
  };

  const sendWiFiConfig = async () => {
    if (!wifiSSID) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setAdding(true);
    setSetupProgress(t('configuring'));
    
    // Try primary method
    let result = await WLEDDiscovery.sendWiFiConfig(wifiSSID, wifiPassword);
    
    // If failed, try alternative
    if (!result.success) {
      result = await WLEDDiscovery.sendWiFiConfigAlt(wifiSSID, wifiPassword);
    }
    
    if (result.success) {
      setSetupStep(4);
      await WLEDDiscovery.waitAndRescan(
        (msg) => setSetupProgress(msg),
        (device) => {
          setSetupProgress('');
          addDiscoveredDevice(device);
        }
      );
    } else {
      setAdding(false);
      Alert.alert(t('configFailed'), result.error);
    }
  };

  // Manual Mode
  const startManualMode = () => {
    setAddMode('manual');
  };

  const handleAddDevice = async () => {
    if (!deviceName || !deviceIP) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setAdding(true);
    try {
      const response = await axios.post(
        `${API_URL}/devices`,
        {
          name: deviceName,
          ip_address: deviceIP,
          led_count: parseInt(deviceLEDCount) || 119,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const isOnline = await WLEDService.isOnline(deviceIP);
      const newDevice = { ...response.data, is_online: isOnline };
      
      setDevices([...devices, newDevice]);
      closeModal();
      Alert.alert(t('success'), t('deviceAdded'));
    } catch (error: any) {
      Alert.alert(t('error'), error.response?.data?.detail || t('failedToLoad'));
    } finally {
      setAdding(false);
    }
  };

  const renderDevice = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceCard}
      onPress={() => router.push(`/(device)/${item.id}`)}
      onLongPress={() => handleDeleteDevice(item.id, item.name)}
    >
      <View style={styles.deviceHeader}>
        <View style={styles.deviceInfo}>
          <Ionicons name="bulb" size={32} color={item.is_online ? '#10b981' : '#6b7280'} />
          <View style={styles.deviceText}>
            <Text style={styles.deviceName}>{item.name}</Text>
            <Text style={styles.deviceIP}>{item.ip_address}</Text>
            <Text style={styles.deviceLEDs}>{item.led_count} {t('leds')}</Text>
          </View>
        </View>
        <View style={[styles.statusDot, item.is_online ? styles.statusOnline : styles.statusOffline]} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('myDevices')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddModal}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bulb-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>{t('noDevices')}</Text>
          <Text style={styles.emptySubtext}>{t('noDevicesSubtext')}</Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
          }
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('addDevice')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder={t('deviceName')}
              placeholderTextColor="#64748b"
              value={deviceName}
              onChangeText={setDeviceName}
            />

            <TextInput
              style={styles.modalInput}
              placeholder={t('ipAddress')}
              placeholderTextColor="#64748b"
              value={deviceIP}
              onChangeText={setDeviceIP}
              keyboardType="numeric"
            />

            <TextInput
              style={styles.modalInput}
              placeholder={t('ledCount')}
              placeholderTextColor="#64748b"
              value={deviceLEDCount}
              onChangeText={setDeviceLEDCount}
              keyboardType="number-pad"
            />

            <TouchableOpacity
              style={[styles.modalButton, adding && styles.modalButtonDisabled]}
              onPress={handleAddDevice}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>{t('addDevice')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f1f5f9',
  },
  addButton: {
    backgroundColor: '#6366f1',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  deviceCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceText: {
    marginLeft: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  deviceIP: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 2,
  },
  deviceLEDs: {
    fontSize: 12,
    color: '#64748b',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusOnline: {
    backgroundColor: '#10b981',
  },
  statusOffline: {
    backgroundColor: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f1f5f9',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f1f5f9',
  },
  modalInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    color: '#f1f5f9',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

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
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header with close button */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {addMode === 'select' && t('addDevice')}
                {addMode === 'scan' && t('foundDevices')}
                {addMode === 'setup' && t('setupMode')}
                {addMode === 'manual' && t('addDevice')}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* MODE SELECT - Choose method */}
              {addMode === 'select' && (
                <View style={styles.methodSelector}>
                  <TouchableOpacity 
                    style={styles.methodButton}
                    onPress={startMDNSScan}
                  >
                    <View style={styles.methodIcon}>
                      <Ionicons name="search" size={32} color="#818cf8" />
                    </View>
                    <View style={styles.methodTextContainer}>
                      <Text style={styles.methodButtonTitle}>{t('scanNetwork')}</Text>
                      <Text style={styles.methodButtonDesc}>{t('scanningNetwork')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#64748b" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.methodButton}
                    onPress={startSetupMode}
                  >
                    <View style={[styles.methodIcon, { backgroundColor: '#422006' }]}>
                      <Ionicons name="settings" size={32} color="#f59e0b" />
                    </View>
                    <View style={styles.methodTextContainer}>
                      <Text style={styles.methodButtonTitle}>{t('setupMode')}</Text>
                      <Text style={styles.methodButtonDesc}>{t('setupModeInstructions')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#64748b" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.methodButton}
                    onPress={startManualMode}
                  >
                    <View style={[styles.methodIcon, { backgroundColor: '#064e3b' }]}>
                      <Ionicons name="create" size={32} color="#10b981" />
                    </View>
                    <View style={styles.methodTextContainer}>
                      <Text style={styles.methodButtonTitle}>{t('manualIP')}</Text>
                      <Text style={styles.methodButtonDesc}>{t('ipAddress')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>
              )}

              {/* MODE SCAN - Discovered devices list */}
              {addMode === 'scan' && (
                <View style={styles.scanMode}>
                  {scanning && (
                    <View style={styles.scanningContainer}>
                      <ActivityIndicator size="large" color="#6366f1" />
                      <Text style={styles.scanningText}>{t('scanning')}</Text>
                    </View>
                  )}

                  {!scanning && discoveredDevices.length === 0 && (
                    <View style={styles.emptyStateContainer}>
                      <Ionicons name="sad-outline" size={48} color="#64748b" />
                      <Text style={styles.emptyStateText}>{t('noDevicesFound')}</Text>
                      <TouchableOpacity 
                        style={styles.retryButton}
                        onPress={startMDNSScan}
                      >
                        <Text style={styles.retryButtonText}>{t('scanNetwork')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {discoveredDevices.map((device, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.discoveredDevice}
                      onPress={() => addDiscoveredDevice(device)}
                      disabled={adding}
                    >
                      <Ionicons name="bulb" size={32} color="#10b981" />
                      <View style={styles.discoveredDeviceInfo}>
                        <Text style={styles.discoveredDeviceName}>{device.name}</Text>
                        <Text style={styles.discoveredDeviceIP}>{device.ip}</Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color="#6366f1" />
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity 
                    style={styles.backButton}
                    onPress={() => setAddMode('select')}
                  >
                    <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                    <Text style={styles.backButtonText}>{t('cancel')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.notFoundButton}
                    onPress={startSetupMode}
                  >
                    <Text style={styles.notFoundButtonText}>{t('dontSeeDevice')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* MODE SETUP - Wizard */}
              {addMode === 'setup' && (
                <View style={styles.setupMode}>
                  {/* Step 1: Instructions */}
                  {setupStep === 1 && (
                    <View style={styles.setupStep}>
                      <View style={styles.stepIndicator}>
                        <Text style={styles.stepNumber}>1</Text>
                      </View>
                      <Text style={styles.setupStepTitle}>{t('step1')}</Text>
                      <Text style={styles.setupStepDesc}>{t('step1Desc')}</Text>
                      
                      <View style={styles.wledAPBox}>
                        <Ionicons name="wifi" size={24} color="#818cf8" />
                        <Text style={styles.wledAPText}>{t('wledAPName')}</Text>
                      </View>

                      <Text style={styles.setupInstruction}>
                        📱 {t('step1Desc')}
                      </Text>

                      <TouchableOpacity 
                        style={styles.setupButton}
                        onPress={() => setSetupStep(2)}
                      >
                        <Text style={styles.setupButtonText}>{t('connected')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Step 2: Check connection */}
                  {setupStep === 2 && (
                    <View style={styles.setupStep}>
                      <View style={styles.stepIndicator}>
                        <Text style={styles.stepNumber}>2</Text>
                      </View>
                      <Text style={styles.setupStepTitle}>{t('step2')}</Text>
                      <Text style={styles.setupStepDesc}>{t('step2Desc')}</Text>

                      <TouchableOpacity 
                        style={[styles.setupButton, adding && styles.setupButtonDisabled]}
                        onPress={checkAPConnection}
                        disabled={adding}
                      >
                        {adding ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.setupButtonText}>{t('connected')}</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.backButton}
                        onPress={() => setSetupStep(1)}
                      >
                        <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                        <Text style={styles.backButtonText}>{t('cancel')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Step 3: WiFi config */}
                  {setupStep === 3 && (
                    <View style={styles.setupStep}>
                      <View style={styles.stepIndicator}>
                        <Text style={styles.stepNumber}>3</Text>
                      </View>
                      <Text style={styles.setupStepTitle}>{t('step3')}</Text>
                      <Text style={styles.setupStepDesc}>{t('step3Desc')}</Text>

                      <TextInput
                        style={styles.setupInput}
                        placeholder={t('wifiSSID')}
                        placeholderTextColor="#64748b"
                        value={wifiSSID}
                        onChangeText={setWifiSSID}
                      />

                      <TextInput
                        style={styles.setupInput}
                        placeholder={t('wifiPassword')}
                        placeholderTextColor="#64748b"
                        value={wifiPassword}
                        onChangeText={setWifiPassword}
                        secureTextEntry
                      />

                      <TouchableOpacity 
                        style={[styles.setupButton, adding && styles.setupButtonDisabled]}
                        onPress={sendWiFiConfig}
                        disabled={adding}
                      >
                        {adding ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.setupButtonText}>{t('sendConfig')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Step 4: Waiting */}
                  {setupStep === 4 && (
                    <View style={styles.setupStep}>
                      <View style={styles.stepIndicator}>
                        <Text style={styles.stepNumber}>4</Text>
                      </View>
                      <Text style={styles.setupStepTitle}>{t('waitingForDevice')}</Text>
                      
                      <View style={styles.waitingContainer}>
                        <ActivityIndicator size="large" color="#6366f1" />
                        <Text style={styles.waitingText}>{setupProgress}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* MODE MANUAL - Manual IP input */}
              {addMode === 'manual' && (
                <View style={styles.manualMode}>
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

                  <TouchableOpacity 
                    style={styles.backButton}
                    onPress={() => setAddMode('select')}
                  >
                    <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                    <Text style={styles.backButtonText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
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
    maxHeight: '90%',
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
  modalScroll: {
    maxHeight: 500,
  },
  
  // Method Selector Styles
  methodSelector: {
    gap: 16,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  methodIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#312e81',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  methodTextContainer: {
    flex: 1,
  },
  methodButtonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  methodButtonDesc: {
    fontSize: 12,
    color: '#94a3b8',
  },
  
  // Scan Mode Styles
  scanMode: {
    minHeight: 300,
  },
  scanningContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  scanningText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  discoveredDevice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  discoveredDeviceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  discoveredDeviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  discoveredDeviceIP: {
    fontSize: 14,
    color: '#94a3b8',
  },
  notFoundButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  notFoundButtonText: {
    fontSize: 14,
    color: '#818cf8',
    fontWeight: '600',
  },
  
  // Setup Mode Styles
  setupMode: {
    minHeight: 350,
  },
  setupStep: {
    paddingVertical: 20,
  },
  stepIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  stepNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  setupStepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: 8,
    textAlign: 'center',
  },
  setupStepDesc: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 24,
    textAlign: 'center',
  },
  wledAPBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#312e81',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderWidth: 2,
    borderColor: '#818cf8',
  },
  wledAPText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#818cf8',
    marginLeft: 12,
  },
  setupInstruction: {
    fontSize: 14,
    color: '#94a3b8',
    marginVertical: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  setupInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    color: '#f1f5f9',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  setupButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  setupButtonDisabled: {
    opacity: 0.6,
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  waitingText: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 16,
    textAlign: 'center',
  },
  
  // Manual Mode Styles
  manualMode: {
    paddingVertical: 20,
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
  
  // Common Styles
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 16,
  },
  backButtonText: {
    fontSize: 14,
    color: '#94a3b8',
    marginLeft: 8,
  },
});

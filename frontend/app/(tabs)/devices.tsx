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
import axios from 'axios';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

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
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [deviceIP, setDeviceIP] = useState('');
  const [deviceLEDCount, setDeviceLEDCount] = useState('119');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_URL}/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDevices(response.data);
    } catch (error: any) {
      console.error('Failed to fetch devices:', error);
      Alert.alert('Error', 'Failed to load devices');
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
      Alert.alert('Error', 'Please fill in all fields');
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
      
      setDevices([...devices, response.data]);
      setModalVisible(false);
      setDeviceName('');
      setDeviceIP('');
      setDeviceLEDCount('119');
      Alert.alert('Success', 'Device added successfully');
    } catch (error: any) {
      console.error('Failed to add device:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add device');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteDevice = (deviceId: string, deviceName: string) => {
    Alert.alert(
      'Delete Device',
      `Are you sure you want to delete "${deviceName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/devices/${deviceId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setDevices(devices.filter(d => d.id !== deviceId));
              Alert.alert('Success', 'Device deleted');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete device');
            }
          },
        },
      ]
    );
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
            <Text style={styles.deviceLEDs}>{item.led_count} LEDs</Text>
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
        <Text style={styles.title}>My Devices</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bulb-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>No devices yet</Text>
          <Text style={styles.emptySubtext}>Add your first WLED device to get started</Text>
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
              <Text style={styles.modalTitle}>Add Device</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Device Name"
              placeholderTextColor="#64748b"
              value={deviceName}
              onChangeText={setDeviceName}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="IP Address (e.g., 192.168.1.100)"
              placeholderTextColor="#64748b"
              value={deviceIP}
              onChangeText={setDeviceIP}
              keyboardType="numeric"
            />

            <TextInput
              style={styles.modalInput}
              placeholder="LED Count"
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
                <Text style={styles.modalButtonText}>Add Device</Text>
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

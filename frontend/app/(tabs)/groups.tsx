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
  ScrollView,
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
}

interface Group {
  id: string;
  name: string;
  device_ids: string[];
  created_at: string;
}

export default function GroupsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupsRes, devicesRes] = await Promise.all([
        axios.get(`${API_URL}/groups`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/devices`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setGroups(groupsRes.data);
      setDevices(devicesRes.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      Alert.alert('Error', 'Failed to load groups');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const toggleDevice = (deviceId: string) => {
    if (selectedDevices.includes(deviceId)) {
      setSelectedDevices(selectedDevices.filter(id => id !== deviceId));
    } else {
      setSelectedDevices([...selectedDevices, deviceId]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (selectedDevices.length === 0) {
      Alert.alert('Error', 'Please select at least one device');
      return;
    }

    setAdding(true);
    try {
      const response = await axios.post(
        `${API_URL}/groups`,
        { name: groupName, device_ids: selectedDevices },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setGroups([...groups, response.data]);
      setModalVisible(false);
      setGroupName('');
      setSelectedDevices([]);
      Alert.alert('Success', 'Group created successfully');
    } catch (error: any) {
      console.error('Failed to create group:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create group');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteGroup = (groupId: string, groupName: string) => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/groups/${groupId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setGroups(groups.filter(g => g.id !== groupId));
              Alert.alert('Success', 'Group deleted');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const renderGroup = ({ item }: { item: Group }) => {
    const groupDevices = devices.filter(d => item.device_ids.includes(d.id));
    
    return (
      <TouchableOpacity
        style={styles.groupCard}
        onPress={() => router.push(`/(group)/${item.id}`)}
        onLongPress={() => handleDeleteGroup(item.id, item.name)}
      >
        <View style={styles.groupHeader}>
          <View style={styles.groupInfo}>
            <Ionicons name="layers" size={32} color="#818cf8" />
            <View style={styles.groupText}>
              <Text style={styles.groupName}>{item.name}</Text>
              <Text style={styles.deviceCount}>{groupDevices.length} devices</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748b" />
        </View>
        <View style={styles.deviceList}>
          {groupDevices.map((device, index) => (
            <Text key={index} style={styles.deviceItem}>
              {device.name}
            </Text>
          ))}
        </View>
      </TouchableOpacity>
    );
  };

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
        <Text style={styles.title}>My Groups</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (devices.length === 0) {
              Alert.alert('No Devices', 'Please add devices first before creating groups');
              return;
            }
            setModalVisible(true);
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {groups.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="layers-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>No groups yet</Text>
          <Text style={styles.emptySubtext}>Create a group to control multiple devices at once</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroup}
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
              <Text style={styles.modalTitle}>Create Group</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                setGroupName('');
                setSelectedDevices([]);
              }}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Group Name"
              placeholderTextColor="#64748b"
              value={groupName}
              onChangeText={setGroupName}
            />

            <Text style={styles.sectionTitle}>Select Devices:</Text>
            <ScrollView style={styles.deviceSelector}>
              {devices.map((device) => (
                <TouchableOpacity
                  key={device.id}
                  style={styles.deviceCheckbox}
                  onPress={() => toggleDevice(device.id)}
                >
                  <View style={[
                    styles.checkbox,
                    selectedDevices.includes(device.id) && styles.checkboxSelected
                  ]}>
                    {selectedDevices.includes(device.id) && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.deviceCheckboxText}>{device.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalButton, adding && styles.modalButtonDisabled]}
              onPress={handleCreateGroup}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>Create Group</Text>
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
  groupCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupText: {
    marginLeft: 12,
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  deviceCount: {
    fontSize: 14,
    color: '#94a3b8',
  },
  deviceList: {
    marginLeft: 44,
  },
  deviceItem: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
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
    maxHeight: '80%',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  deviceSelector: {
    maxHeight: 200,
    marginBottom: 16,
  },
  deviceCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#334155',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  deviceCheckboxText: {
    fontSize: 16,
    color: '#f1f5f9',
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
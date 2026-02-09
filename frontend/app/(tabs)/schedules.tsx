import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useLanguage } from '../../src/context/LanguageContext';
import axios from 'axios';
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface Schedule {
  id: string;
  name: string;
  target_type: string;
  target_id: string;
  days: number[];
  start_time: string;
  end_time?: string;
  enabled: boolean;
}

export default function SchedulesScreen() {
  const { token } = useAuth();
  const { t } = useLanguage();
  
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [schedulesRes, devicesRes, groupsRes] = await Promise.all([
        axios.get(`${API_URL}/schedules`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/devices`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/groups`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSchedules(schedulesRes.data);
      setDevices(devicesRes.data);
      setGroups(groupsRes.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      Alert.alert(t('error'), t('failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const toggleSchedule = async (scheduleId: string, currentEnabled: boolean) => {
    try {
      const response = await axios.post(
        `${API_URL}/schedules/${scheduleId}/toggle`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSchedules(schedules.map(s => 
        s.id === scheduleId ? { ...s, enabled: response.data.enabled } : s
      ));
      
      Alert.alert(
        t('success'),
        response.data.enabled ? t('scheduleEnabled') : t('scheduleDisabled')
      );
    } catch (error: any) {
      Alert.alert(t('error'), error.response?.data?.detail || t('failedToLoad'));
    }
  };

  const deleteSchedule = (scheduleId: string, scheduleName: string) => {
    Alert.alert(
      t('deleteSchedule'),
      `${t('deleteScheduleConfirm')}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/schedules/${scheduleId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setSchedules(schedules.filter(s => s.id !== scheduleId));
              Alert.alert(t('success'), t('scheduleDeleted'));
            } catch (error: any) {
              Alert.alert(t('error'), t('failedToLoad'));
            }
          },
        },
      ]
    );
  };

  const getTargetName = (schedule: Schedule) => {
    if (schedule.target_type === 'device') {
      const device = devices.find(d => d.id === schedule.target_id);
      return device?.name || 'Unknown Device';
    } else {
      const group = groups.find(g => g.id === schedule.target_id);
      return group?.name || 'Unknown Group';
    }
  };

  const getDaysText = (days: number[]) => {
    if (days.length === 7) return t('selectDays');
    return days.sort().map(day => t(DAY_NAMES[day]).substring(0, 3)).join(', ');
  };

  const renderSchedule = ({ item }: { item: Schedule }) => (
    <View style={styles.scheduleCard}>
      <View style={styles.scheduleHeader}>
        <View style={styles.scheduleInfo}>
          <View style={styles.scheduleTitleRow}>
            <Text style={styles.scheduleName}>{item.name}</Text>
            {item.enabled && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeText}>{t('activeSchedule')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.scheduleTarget}>
            {item.target_type === 'device' ? '📱' : '📦'} {getTargetName(item)}
          </Text>
          <Text style={styles.scheduleDays}>{getDaysText(item.days)}</Text>
          <Text style={styles.scheduleTime}>
            ⏰ {item.start_time} {item.end_time ? `→ ${item.end_time}` : ''}
          </Text>
        </View>
        <View style={styles.scheduleActions}>
          <Switch
            value={item.enabled}
            onValueChange={() => toggleSchedule(item.id, item.enabled)}
            trackColor={{ false: '#334155', true: '#818cf8' }}
            thumbColor={item.enabled ? '#6366f1' : '#94a3b8'}
          />
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteSchedule(item.id, item.name)}
          >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
        <Text style={styles.title}>{t('mySchedules')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (devices.length === 0 && groups.length === 0) {
              Alert.alert(t('error'), t('addDevicesFirst'));
              return;
            }
            setModalVisible(true);
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#818cf8" />
        <Text style={styles.infoText}>
          Harmonogramy działają gdy aplikacja jest otwarta
        </Text>
      </View>

      {schedules.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>{t('noSchedules')}</Text>
          <Text style={styles.emptySubtext}>{t('noSchedulesSubtext')}</Text>
        </View>
      ) : (
        <FlatList
          data={schedules}
          renderItem={renderSchedule}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Text style={styles.comingSoon}>
        🚧 Formularz tworzenia harmonogramów - coming soon! 
        {'\n'}Backend gotowy, frontend w następnej iteracji
      </Text>
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 14,
    marginLeft: 8,
  },
  listContent: {
    padding: 16,
  },
  scheduleCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scheduleName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginRight: 8,
  },
  activeBadge: {
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scheduleTarget: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 4,
  },
  scheduleDays: {
    fontSize: 14,
    color: '#818cf8',
    marginBottom: 4,
  },
  scheduleTime: {
    fontSize: 14,
    color: '#f59e0b',
  },
  scheduleActions: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteButton: {
    marginTop: 12,
    padding: 8,
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
  comingSoon: {
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 14,
    fontStyle: 'italic',
  },
});

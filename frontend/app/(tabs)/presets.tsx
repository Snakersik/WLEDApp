import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

interface Preset {
  id: string;
  name: string;
  effect_id: number;
  speed: number;
  intensity: number;
  palette: number;
  is_premium: boolean;
  description: string;
}

export default function PresetsScreen() {
  const { token, user } = useAuth();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const response = await axios.get(`${API_URL}/presets`);
      setPresets(response.data);
    } catch (error: any) {
      console.error('Failed to fetch presets:', error);
      Alert.alert('Error', 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  };

  const renderPreset = ({ item }: { item: Preset }) => {
    const isLocked = item.is_premium && !user?.has_subscription;

    return (
      <View style={styles.presetCard}>
        <View style={styles.presetHeader}>
          <View style={styles.presetInfo}>
            <Ionicons 
              name={isLocked ? "lock-closed" : "color-palette"} 
              size={28} 
              color={isLocked ? "#f59e0b" : "#818cf8"} 
            />
            <View style={styles.presetText}>
              <View style={styles.presetTitleRow}>
                <Text style={styles.presetName}>{item.name}</Text>
                {item.is_premium && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumText}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={styles.presetDescription}>{item.description}</Text>
            </View>
          </View>
        </View>
        
        {isLocked && (
          <View style={styles.lockedOverlay}>
            <Text style={styles.lockedText}>Premium subscription required</Text>
          </View>
        )}
      </View>
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
        <Text style={styles.title}>Presets</Text>
        {!user?.has_subscription && (
          <View style={styles.premiumIndicator}>
            <Ionicons name="lock-closed" size={16} color="#f59e0b" />
            <Text style={styles.premiumIndicatorText}>Premium Required</Text>
          </View>
        )}
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#818cf8" />
        <Text style={styles.infoText}>
          Apply presets to your devices from the device control screen
        </Text>
      </View>

      <FlatList
        data={presets}
        renderItem={renderPreset}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
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
  premiumIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#422006',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  premiumIndicatorText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
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
  presetCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  presetText: {
    marginLeft: 12,
    flex: 1,
  },
  presetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginRight: 8,
  },
  premiumBadge: {
    backgroundColor: '#422006',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  premiumText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: 'bold',
  },
  presetDescription: {
    fontSize: 14,
    color: '#94a3b8',
  },
  lockedOverlay: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  lockedText: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '500',
  },
});
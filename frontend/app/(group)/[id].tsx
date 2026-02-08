import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import Slider from '@react-native-community/slider';
import { TriangleColorPicker } from 'react-native-color-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

interface Group {
  id: string;
  name: string;
  device_ids: string[];
}

interface Preset {
  id: string;
  name: string;
  description: string;
  is_premium: boolean;
}

export default function GroupControlScreen() {
  const { id } = useLocalSearchParams();
  const { token, user } = useAuth();
  const router = useRouter();
  
  const [group, setGroup] = useState<Group | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [controlling, setControlling] = useState(false);
  
  const [isOn, setIsOn] = useState(true);
  const [brightness, setBrightness] = useState(128);
  const [selectedColor, setSelectedColor] = useState('#ff0000');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupRes, presetsRes] = await Promise.all([
        axios.get(`${API_URL}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/presets`),
      ]);
      const foundGroup = groupRes.data.find((g: Group) => g.id === id);
      if (!foundGroup) {
        throw new Error('Group not found');
      }
      setGroup(foundGroup);
      setPresets(presetsRes.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      Alert.alert('Error', 'Failed to load group');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16),
        ]
      : [255, 0, 0];
  };

  const controlGroup = async (params: any) => {
    setControlling(true);
    try {
      const response = await axios.post(
        `${API_URL}/groups/${id}/control`,
        params,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const failedDevices = response.data.results.filter((r: any) => !r.success);
      if (failedDevices.length > 0) {
        Alert.alert(
          'Partial Success',
          `${failedDevices.length} device(s) failed to respond`
        );
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'Failed to control group';
      Alert.alert('Error', errorMsg);
    } finally {
      setControlling(false);
    }
  };

  const handleTogglePower = async (value: boolean) => {
    setIsOn(value);
    await controlGroup({ on: value });
  };

  const handleBrightnessChange = async (value: number) => {
    setBrightness(value);
  };

  const handleBrightnessComplete = async () => {
    await controlGroup({ brightness: Math.round(brightness) });
  };

  const handleColorChange = (color: string) => {
    setSelectedColor(color);
  };

  const handleColorComplete = async () => {
    const rgb = hexToRgb(selectedColor);
    await controlGroup({ color: rgb });
  };

  const handlePresetSelect = async (presetId: string, isPremium: boolean) => {
    if (isPremium && !user?.has_subscription) {
      Alert.alert(
        'Premium Required',
        'This preset requires a premium subscription',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Upgrade',
            onPress: () => router.push('/(tabs)/profile'),
          },
        ]
      );
      return;
    }

    setSelectedPreset(presetId);
    await controlGroup({ preset_id: presetId });
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{group?.name}</Text>
          <Text style={styles.deviceCount}>{group?.device_ids.length} devices</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Power Control */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Power</Text>
            <Switch
              value={isOn}
              onValueChange={handleTogglePower}
              trackColor={{ false: '#334155', true: '#818cf8' }}
              thumbColor={isOn ? '#6366f1' : '#94a3b8'}
              disabled={controlling}
            />
          </View>
        </View>

        {/* Brightness Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Brightness</Text>
          <View style={styles.sliderContainer}>
            <Ionicons name="sunny-outline" size={20} color="#94a3b8" />
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={255}
              value={brightness}
              onValueChange={handleBrightnessChange}
              onSlidingComplete={handleBrightnessComplete}
              minimumTrackTintColor="#6366f1"
              maximumTrackTintColor="#334155"
              thumbTintColor="#6366f1"
              disabled={controlling}
            />
            <Text style={styles.brightnessValue}>{Math.round(brightness)}</Text>
          </View>
        </View>

        {/* Color Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color</Text>
          <View style={styles.colorPickerContainer}>
            <TriangleColorPicker
              oldColor={selectedColor}
              color={selectedColor}
              onColorChange={handleColorChange}
              onColorSelected={handleColorComplete}
              style={styles.colorPicker}
            />
          </View>
          <TouchableOpacity
            style={[styles.applyButton, controlling && styles.applyButtonDisabled]}
            onPress={handleColorComplete}
            disabled={controlling}
          >
            <Text style={styles.applyButtonText}>Apply Color to Group</Text>
          </TouchableOpacity>
        </View>

        {/* Presets */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Presets</Text>
          <View style={styles.presetsGrid}>
            {presets.map((preset) => {
              const isLocked = preset.is_premium && !user?.has_subscription;
              const isSelected = selectedPreset === preset.id;
              
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.presetCard,
                    isSelected && styles.presetCardSelected,
                    isLocked && styles.presetCardLocked,
                  ]}
                  onPress={() => handlePresetSelect(preset.id, preset.is_premium)}
                  disabled={controlling}
                >
                  {isLocked && (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={12} color="#f59e0b" />
                    </View>
                  )}
                  <Ionicons
                    name="color-palette"
                    size={24}
                    color={isLocked ? '#f59e0b' : isSelected ? '#6366f1' : '#818cf8'}
                  />
                  <Text style={[
                    styles.presetName,
                    isSelected && styles.presetNameSelected,
                  ]}>
                    {preset.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  placeholder: {
    width: 44,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  deviceCount: {
    fontSize: 12,
    color: '#94a3b8',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
  },
  slider: {
    flex: 1,
    marginHorizontal: 12,
  },
  brightnessValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    minWidth: 40,
    textAlign: 'right',
  },
  colorPickerContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  colorPicker: {
    height: 250,
    width: '100%',
  },
  applyButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  presetCardSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#312e81',
  },
  presetCardLocked: {
    opacity: 0.7,
  },
  lockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#422006',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetName: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
  },
  presetNameSelected: {
    color: '#f1f5f9',
    fontWeight: '600',
  },
});
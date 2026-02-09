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
import { useAuth } from '../../src/context/AuthContext';
import { useLanguage } from '../../src/context/LanguageContext';
import axios from 'axios';
import Slider from '@react-native-community/slider';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

}

interface Preset {
  id: string;
  name: string;
  description: string;
  is_premium: boolean;
}

const PRESET_COLORS = [
  { name: 'Red', color: '#FF0000', rgb: [255, 0, 0] },
  { name: 'Green', color: '#00FF00', rgb: [0, 255, 0] },
  { name: 'Blue', color: '#0000FF', rgb: [0, 0, 255] },
  { name: 'Yellow', color: '#FFFF00', rgb: [255, 255, 0] },
  { name: 'Purple', color: '#FF00FF', rgb: [255, 0, 255] },
  { name: 'Cyan', color: '#00FFFF', rgb: [0, 255, 255] },
  { name: 'Orange', color: '#FF8800', rgb: [255, 136, 0] },
  { name: 'Pink', color: '#FF1493', rgb: [255, 20, 147] },
  { name: 'White', color: '#FFFFFF', rgb: [255, 255, 255] },
];

export default function GroupControlScreen() {
  const { id } = useLocalSearchParams();
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  
  const [device, setGroup] = useState<Group | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [controlling, setControlling] = useState(false);
  
  const [isOn, setIsOn] = useState(true);
  const [brightness, setBrightness] = useState(128);
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [deviceRes, presetsRes] = await Promise.all([
        axios.get(`${API_URL}/devices/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/presets`),
      ]);
      setGroup(deviceRes.data);
      setPresets(presetsRes.data);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      Alert.alert(t('error'), t('failedToLoad'));
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const controlGroup = async (params: any) => {
    if (!device?.is_online) {
      Alert.alert(t('deviceOffline'), t('deviceNotReachable'));
      return;
    }

    setControlling(true);
    try {
      await axios.post(
        `${API_URL}/devices/${id}/control`,
        params,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || t('failedToControl');
      Alert.alert(t('error'), errorMsg);
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

  const handleColorSelect = async (color: typeof PRESET_COLORS[0]) => {
    setSelectedColor(color);
    await controlGroup({ color: color.rgb });
  };

  const handlePresetSelect = async (presetId: string, isPremium: boolean) => {
    if (isPremium && !user?.has_subscription) {
      Alert.alert(
        t('premiumRequired'),
        t('presetRequiresPremium'),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('upgrade'),
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
          <Text style={styles.title}>{device?.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, device?.is_online ? styles.statusOnline : styles.statusOffline]} />
            <Text style={styles.statusText}>
              {device?.is_online ? t('online') : t('offline')}
            </Text>
          </View>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Power Control */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('power')}</Text>
            <Switch
              value={isOn}
              onValueChange={handleTogglePower}
              trackColor={{ false: '#334155', true: '#818cf8' }}
              thumbColor={isOn ? '#6366f1' : '#94a3b8'}
              disabled={controlling || !device?.is_online}
            />
          </View>
        </View>

        {/* Brightness Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('brightness')}</Text>
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
              disabled={controlling || !device?.is_online}
            />
            <Text style={styles.brightnessValue}>{Math.round(brightness)}</Text>
          </View>
        </View>

        {/* Color Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('color')}</Text>
          <View style={styles.colorGrid}>
            {PRESET_COLORS.map((color, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.colorButton,
                  { backgroundColor: color.color },
                  selectedColor.name === color.name && styles.colorButtonSelected
                ]}
                onPress={() => handleColorSelect(color)}
                disabled={controlling || !device?.is_online}
              >
                {selectedColor.name === color.name && (
                  <Ionicons name="checkmark" size={24} color="#000" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Presets */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('presets')}</Text>
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
                  disabled={controlling || !device?.is_online}
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusOnline: {
    backgroundColor: '#10b981',
  },
  statusOffline: {
    backgroundColor: '#6b7280',
  },
  statusText: {
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
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#334155',
  },
  colorButtonSelected: {
    borderColor: '#6366f1',
    borderWidth: 4,
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

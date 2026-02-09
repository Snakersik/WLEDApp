import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useLanguage, Language } from '../../src/context/LanguageContext';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { user, logout, upgradeSubscription } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();
  const [languageModalVisible, setLanguageModalVisible] = React.useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('logout'),
      t('logoutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleUpgradeSubscription = () => {
    Alert.alert(
      t('upgradeToPremiumTitle'),
      t('upgradeToPremiumDesc'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('upgrade'),
          onPress: async () => {
            try {
              await upgradeSubscription();
              Alert.alert(t('success'), t('subscriptionActivated'));
            } catch (error: any) {
              Alert.alert(t('error'), error.message);
            }
          },
        },
      ]
    );
  };

  const handleLanguageSelect = async (lang: Language) => {
    await setLanguage(lang);
    setLanguageModalVisible(false);
    Alert.alert(t('success'), t('languageChanged'));
  };

  const getLanguageName = (lang: Language) => {
    switch (lang) {
      case 'pl': return t('polish');
      case 'en': return t('english');
      case 'de': return t('german');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile')}</Text>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={48} color="#f1f5f9" />
            </View>
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        {/* Language Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('language')}</Text>
          <TouchableOpacity
            style={styles.languageCard}
            onPress={() => setLanguageModalVisible(true)}
          >
            <View style={styles.languageHeader}>
              <Ionicons name="language" size={32} color="#818cf8" />
              <View style={styles.languageInfo}>
                <Text style={styles.languageTitle}>{t('selectLanguage')}</Text>
                <Text style={styles.languageText}>{getLanguageName(language)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#64748b" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('subscription')}</Text>
          {user?.has_subscription ? (
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <Ionicons name="star" size={32} color="#fbbf24" />
                <View style={styles.subscriptionInfo}>
                  <Text style={styles.subscriptionTitle}>{t('premiumActive')}</Text>
                  <Text style={styles.subscriptionText}>{t('accessToAllPresets')}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={28} color="#10b981" />
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.upgradeCard}
              onPress={handleUpgradeSubscription}
            >
              <View style={styles.upgradeHeader}>
                <Ionicons name="star-outline" size={32} color="#f59e0b" />
                <View style={styles.upgradeInfo}>
                  <Text style={styles.upgradeTitle}>{t('upgradeToPremium')}</Text>
                  <Text style={styles.upgradeText}>{t('unlockAllPresets')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#64748b" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('about')}</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle-outline" size={24} color="#818cf8" />
              <Text style={styles.infoText}>{t('version')}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="bulb-outline" size={24} color="#818cf8" />
              <Text style={styles.infoText}>{t('controlYourDevices')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            <Text style={styles.logoutText}>{t('logout')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={languageModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectLanguage')}</Text>
              <TouchableOpacity onPress={() => setLanguageModalVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.languageOption, language === 'pl' && styles.languageOptionSelected]}
              onPress={() => handleLanguageSelect('pl')}
            >
              <Text style={styles.languageOptionText}>🇵🇱 {t('polish')}</Text>
              {language === 'pl' && <Ionicons name="checkmark" size={24} color="#6366f1" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.languageOption, language === 'en' && styles.languageOptionSelected]}
              onPress={() => handleLanguageSelect('en')}
            >
              <Text style={styles.languageOptionText}>🇬🇧 {t('english')}</Text>
              {language === 'en' && <Ionicons name="checkmark" size={24} color="#6366f1" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.languageOption, language === 'de' && styles.languageOptionSelected]}
              onPress={() => handleLanguageSelect('de')}
            >
              <Text style={styles.languageOptionText}>🇩🇪 {t('german')}</Text>
              {language === 'de' && <Ionicons name="checkmark" size={24} color="#6366f1" />}
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
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f1f5f9',
  },
  profileSection: {
    alignItems: 'center',
    padding: 32,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#475569',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#94a3b8',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  languageCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  languageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageInfo: {
    flex: 1,
    marginLeft: 16,
  },
  languageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  languageText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  subscriptionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subscriptionInfo: {
    flex: 1,
    marginLeft: 16,
  },
  subscriptionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  subscriptionText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  upgradeCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeInfo: {
    flex: 1,
    marginLeft: 16,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  upgradeText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  infoCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#94a3b8',
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#991b1b',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
    marginLeft: 8,
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
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  languageOptionSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#312e81',
  },
  languageOptionText: {
    fontSize: 18,
    color: '#f1f5f9',
    fontWeight: '600',
  },
});

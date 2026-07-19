import { parseSignupIntent } from '@/lib/authRole';
import {
  DEFAULT_SIGNUP_COUNTRY,
  formatSignupPhoneDisplay,
  isCompleteSignupPhone,
  SIGNUP_COUNTRIES,
  signupPhoneDigitsOnly,
  signupPhoneForFirestore,
  type SignupCountry,
} from '@/lib/signupPhoneCountry';
import { useAuth } from '../../services/AuthContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppTextInput } from '../../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getAuthFlowFriendlyMessage,
  isEmailAlreadyInUseError,
  resolveAuthEmailAccountStatus,
} from '@/services/auth/emailAccountStatus';
import { showError, showSuccess } from '../../utils/toast';

const TOTAL_STEPS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AUTH = {
  bg: '#09090B',
  card: '#171923',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  placeholder: '#7D8493',
  primary: '#FF6B35',
  border: 'rgba(255,255,255,0.08)',
  inputBg: '#1E2230',
} as const;

function detectSignupCountry(): SignupCountry {
  try {
    const locale =
      Intl.DateTimeFormat().resolvedOptions().locale ||
      (typeof navigator !== 'undefined' ? navigator.language : '') ||
      '';
    const region = locale.split(/[-_]/)[1]?.toUpperCase();
    if (region) {
      const match = SIGNUP_COUNTRIES.find((c) => c.code === region);
      if (match) return match;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_SIGNUP_COUNTRY;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { intent: intentParam, email: emailParam } = useLocalSearchParams<{
    intent?: string;
    email?: string;
  }>();
  const signupIntent = parseSignupIntent(intentParam);
  const { signUpWithEmail } = useAuth();

  const [step, setStep] = useState(0);
  const slideX = useRef(new Animated.Value(0)).current;
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState(
    typeof emailParam === 'string' ? emailParam.trim().toLowerCase() : '',
  );
  const [country, setCountry] = useState<SignupCountry>(DEFAULT_SIGNUP_COUNTRY);
  const [phoneNational, setPhoneNational] = useState('');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showSignInCta, setShowSignInCta] = useState(false);

  useEffect(() => {
    setCountry(detectSignupCountry());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (step === 0) nameRef.current?.focus();
      if (step === 1) emailRef.current?.focus();
      if (step === 2) phoneRef.current?.focus();
      if (step === 3) passwordRef.current?.focus();
    }, 280);
    return () => clearTimeout(t);
  }, [step]);

  const phonePreview = useMemo(
    () => formatSignupPhoneDisplay(country, phoneNational),
    [country, phoneNational],
  );

  const animateToStep = (next: number) => {
    Keyboard.dismiss();
    setFormError(null);
    setShowSignInCta(false);
    setStep(next);
    Animated.timing(slideX, {
      toValue: -next * SCREEN_WIDTH,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const goBack = () => {
    if (loading) return;
    if (step === 0) {
      router.back();
      return;
    }
    animateToStep(step - 1);
  };

  const validateStep = (index: number): string => {
    if (index === 0) {
      if (!name.trim()) return 'Enter your name';
      return '';
    }
    if (index === 1) {
      const emailTrim = email.trim().toLowerCase();
      if (!emailTrim || !EMAIL_RE.test(emailTrim)) return 'Enter a valid email';
      return '';
    }
    if (index === 2) {
      if (!signupPhoneDigitsOnly(phoneNational)) return 'Enter your phone number';
      if (!isCompleteSignupPhone(country, phoneNational)) {
        return 'Enter a complete phone number';
      }
      return '';
    }
    if (index === 3) {
      if (password.length < 8) return 'Use at least 8 characters';
      return '';
    }
    if (index === 4) {
      if (!termsConsent) {
        return 'Please agree to the Terms of Service and Privacy Policy.';
      }
      return '';
    }
    return '';
  };

  const onContinue = async () => {
    const err = validateStep(step);
    if (err) {
      setFormError(err);
      showError(err);
      return;
    }

    if (step < TOTAL_STEPS - 1) {
      if (step === 1) {
        const emailTrim = email.trim().toLowerCase();
        setLoading(true);
        try {
          const status = await resolveAuthEmailAccountStatus(emailTrim);
          if (status === 'exists') {
            setFormError(
              'This email already has an account. Please sign in instead.',
            );
            setShowSignInCta(true);
            return;
          }
        } catch {
          /* lookup failure — allow continue; create will catch conflicts */
        } finally {
          setLoading(false);
        }
      }
      animateToStep(step + 1);
      return;
    }

    setLoading(true);
    setFormError(null);
    setShowSignInCta(false);
    try {
      await signUpWithEmail({
        email: email.trim().toLowerCase(),
        password,
        fullName: name.trim(),
        whatsapp: signupPhoneForFirestore(country, phoneNational),
        phoneDisplay: phonePreview,
        whatsappConsent,
        termsAccepted: true,
        privacyAccepted: true,
        localPhotoUri: null,
        signupIntent,
      });
      showSuccess('Account created successfully 🎉');
      router.replace('/(auth)/location-permission' as never);
    } catch (e: unknown) {
      const friendly = getAuthFlowFriendlyMessage(e);
      setFormError(friendly);
      setShowSignInCta(isEmailAlreadyInUseError(e));
      if (!isEmailAlreadyInUseError(e)) showError(friendly);
    } finally {
      setLoading(false);
    }
  };

  const primaryDisabled =
    loading || (step === TOTAL_STEPS - 1 && !termsConsent);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goBack}
          hitSlop={12}
          disabled={loading}
          accessibilityLabel={step === 0 ? 'Go back' : 'Previous step'}
        >
          <MaterialIcons name="arrow-back" size={24} color={AUTH.text} />
        </TouchableOpacity>
        <Text style={styles.stepLabel}>
          Step {step + 1} of {TOTAL_STEPS}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.progressRow}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={styles.progressSegment}>
            <View
              style={[
                styles.progressDot,
                i <= step ? styles.progressDotOn : styles.progressDotOff,
              ]}
            />
            {i < TOTAL_STEPS - 1 ? (
              <View
                style={[
                  styles.progressLine,
                  i < step ? styles.progressLineOn : styles.progressLineOff,
                ]}
              />
            ) : null}
          </View>
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.sliderClip}>
          <Animated.View
            style={[
              styles.sliderTrack,
              { width: SCREEN_WIDTH * TOTAL_STEPS, transform: [{ translateX: slideX }] },
            ]}
          >
            {/* Step 1 — Name */}
            <View style={styles.stepPane}>
              <Text style={styles.title}>What's your name?</Text>
              <Text style={styles.subtitle}>
                This is how other people will recognize you.
              </Text>
              <AppTextInput
                ref={nameRef}
                style={styles.input}
                placeholder="Name"
                placeholderTextColor={AUTH.placeholder}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
                returnKeyType="next"
                onSubmitEditing={() => void onContinue()}
              />
            </View>

            {/* Step 2 — Email */}
            <View style={styles.stepPane}>
              <Text style={styles.title}>What's your email?</Text>
              <Text style={styles.subtitle}>We'll use this to sign you in.</Text>
              <AppTextInput
                ref={emailRef}
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={AUTH.placeholder}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (formError) {
                    setFormError(null);
                    setShowSignInCta(false);
                  }
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                returnKeyType="next"
                onSubmitEditing={() => void onContinue()}
              />
            </View>

            {/* Step 3 — Phone */}
            <View style={styles.stepPane}>
              <Text style={styles.title}>What's your phone number?</Text>
              <Text style={styles.subtitle}>
                Used only to coordinate meal pickup.
              </Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={styles.countryBtn}
                  onPress={() => setCountryPickerOpen(true)}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityLabel="Select country code"
                >
                  <Text style={styles.countryFlag}>{country.flag}</Text>
                  <Text style={styles.countryDial}>+{country.dial}</Text>
                  <MaterialIcons
                    name="arrow-drop-down"
                    size={20}
                    color={AUTH.textMuted}
                  />
                </TouchableOpacity>
                <AppTextInput
                  ref={phoneRef}
                  style={styles.phoneInput}
                  placeholder="Phone number"
                  placeholderTextColor={AUTH.placeholder}
                  value={phoneNational}
                  onChangeText={(t) => setPhoneNational(signupPhoneDigitsOnly(t))}
                  keyboardType="phone-pad"
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() => void onContinue()}
                />
              </View>
            </View>

            {/* Step 4 — Password */}
            <View style={styles.stepPane}>
              <Text style={styles.title}>Create a password</Text>
              <Text style={styles.subtitle}>Use at least 8 characters.</Text>
              <AppTextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={AUTH.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                returnKeyType="next"
                onSubmitEditing={() => void onContinue()}
              />
            </View>

            {/* Step 5 — Agreements */}
            <View style={styles.stepPane}>
              <Text style={styles.title}>Almost done</Text>
              <Text style={styles.subtitle}>
                Review and accept the required agreements.
              </Text>

              <TouchableOpacity
                style={styles.consentRow}
                onPress={() => setWhatsappConsent((v) => !v)}
                disabled={loading}
                activeOpacity={0.75}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: whatsappConsent }}
              >
                <MaterialIcons
                  name={
                    whatsappConsent ? 'check-box' : 'check-box-outline-blank'
                  }
                  size={22}
                  color={whatsappConsent ? AUTH.primary : AUTH.placeholder}
                />
                <Text style={styles.consentLabel}>
                  I agree to use my WhatsApp number for order coordination.
                </Text>
              </TouchableOpacity>

              <View style={styles.consentRow}>
                <TouchableOpacity
                  onPress={() => setTermsConsent((v) => !v)}
                  disabled={loading}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: termsConsent }}
                >
                  <MaterialIcons
                    name={
                      termsConsent ? 'check-box' : 'check-box-outline-blank'
                    }
                    size={22}
                    color={termsConsent ? AUTH.primary : AUTH.placeholder}
                  />
                </TouchableOpacity>
                <Text style={styles.consentLabel}>
                  I agree to the{' '}
                  <Text
                    style={styles.legalLink}
                    onPress={() => router.push('/terms' as never)}
                  >
                    Terms of Service
                  </Text>
                  {' and '}
                  <Text
                    style={styles.legalLink}
                    onPress={() => router.push('/privacy' as never)}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          {formError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{formError}</Text>
              {showSignInCta ? (
                <TouchableOpacity
                  style={styles.signInCta}
                  onPress={() =>
                    router.replace({
                      pathname: '/(auth)/login',
                      params: email.trim()
                        ? { email: email.trim().toLowerCase() }
                        : undefined,
                    } as never)
                  }
                >
                  <Text style={styles.signInCtaText}>Go to Sign In</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, primaryDisabled && styles.primaryBtnDisabled]}
            onPress={() => void onContinue()}
            disabled={primaryDisabled}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {step === TOTAL_STEPS - 1 ? 'Create Account' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={countryPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCountryPickerOpen(false)}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setCountryPickerOpen(false)}
        >
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Country code</Text>
            <FlatList
              data={SIGNUP_COUNTRIES}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.code === country.code;
                return (
                  <TouchableOpacity
                    style={[styles.pickerRow, selected && styles.pickerRowOn]}
                    onPress={() => {
                      setCountry(item);
                      setCountryPickerOpen(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerFlag}>{item.flag}</Text>
                    <Text style={styles.pickerName}>{item.name}</Text>
                    <Text style={styles.pickerDial}>+{item.dial}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AUTH.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: AUTH.textMuted,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 12,
  },
  progressSegment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  progressDotOn: { backgroundColor: AUTH.primary },
  progressDotOff: { backgroundColor: 'rgba(255,255,255,0.18)' },
  progressLine: {
    width: 28,
    height: 2,
    marginHorizontal: 4,
  },
  progressLineOn: { backgroundColor: AUTH.primary },
  progressLineOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  sliderClip: {
    flex: 1,
    overflow: 'hidden',
  },
  sliderTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  stepPane: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AUTH.text,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: AUTH.textMuted,
    marginBottom: 28,
    fontWeight: '500',
  },
  input: {
    backgroundColor: AUTH.inputBg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: AUTH.text,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH.inputBg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 4,
  },
  countryFlag: { fontSize: 18 },
  countryDial: {
    fontSize: 16,
    fontWeight: '700',
    color: AUTH.text,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: AUTH.inputBg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: AUTH.text,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  consentLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: AUTH.text,
    fontWeight: '500',
  },
  legalLink: {
    color: AUTH.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 16,
    paddingTop: 8,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: AUTH.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: '#7D8493',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  errorBanner: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  signInCta: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AUTH.primary,
  },
  signInCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    maxHeight: '70%',
    backgroundColor: AUTH.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: AUTH.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AUTH.border,
  },
  pickerRowOn: {
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  pickerFlag: { fontSize: 22 },
  pickerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: AUTH.text,
  },
  pickerDial: {
    fontSize: 15,
    fontWeight: '700',
    color: AUTH.textMuted,
  },
});

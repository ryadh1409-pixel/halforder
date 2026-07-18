import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '../../components/KeyboardToolbar';
import {
  isCompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '../../lib/profileWhatsAppPhone';
import { parseSignupIntent } from '@/lib/authRole';
import { navigateForRole } from '@/lib/navigation';
import { auth } from '@/services/firebase';
import { useAuth } from '../../services/AuthContext';
import { getUserRole } from '@/services/userService';
import {
  ImagePickerPermissionError,
  pickImageFromLibrary,
  takePhoto,
} from '../../services/imagePicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { AppTextInput } from '../../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { systemActionSheet } from '../../components/SystemDialogHost';
import {
  getAuthFlowFriendlyMessage,
  isEmailAlreadyInUseError,
  resolveAuthEmailAccountStatus,
} from '@/services/auth/emailAccountStatus';
import { showError, showSuccess } from '../../utils/toast';
import { showUserError } from '@/services/errors';

const REGISTER_INPUTS = 5;
const PHOTO_SIZE = 92;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Auth stack dark theme — aligned with login / onboarding */
const AUTH = {
  bg: '#09090B',
  card: '#171923',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  inputBg: '#1C2030',
  inputBorder: 'rgba(255,255,255,0.08)',
  placeholder: '#7D8493',
  primary: '#FF6B35',
} as const;

export default function RegisterScreen() {
  const router = useRouter();
  const { intent: intentParam, email: emailParam } = useLocalSearchParams<{
    intent?: string;
    email?: string;
  }>();
  const signupIntent = parseSignupIntent(intentParam);
  const { signUpWithEmail } = useAuth();
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const whatsappRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(
    typeof emailParam === 'string' ? emailParam.trim().toLowerCase() : '',
  );
  const [whatsapp, setWhatsapp] = useState('+1 ');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [whatsappCoordinationConsent, setWhatsappCoordinationConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showSignInCta, setShowSignInCta] = useState(false);

  const refs = [nameRef, emailRef, whatsappRef, passwordRef, confirmPasswordRef];
  const focusPrev = () => {
    if (focusedIndex !== null && focusedIndex > 0) {
      refs[focusedIndex - 1].current?.focus();
      setFocusedIndex(focusedIndex - 1);
    }
  };
  const focusNext = () => {
    if (focusedIndex !== null && focusedIndex < REGISTER_INPUTS - 1) {
      refs[focusedIndex + 1].current?.focus();
      setFocusedIndex(focusedIndex + 1);
    }
  };

  const handleChooseFromLibrary = async () => {
    setPickingPhoto(true);
    try {
      const uri = await pickImageFromLibrary({ quality: 0.7 });
      if (uri) {
        setPhotoUri(uri);
      }
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) {
        showUserError(e, { useAlert: true, alertTitle: 'Photo access needed' });
      } else if (e instanceof Error && e.message === 'PICKER_LAUNCH_FAILED') {
        Alert.alert('Error', 'Could not open photo library.');
      } else {
        showUserError(e, { useAlert: true, alertTitle: 'Error' });
      }
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleTakePhoto = async () => {
    setPickingPhoto(true);
    try {
      const uri = await takePhoto({ quality: 0.7 });
      if (uri) {
        setPhotoUri(uri);
      }
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) {
        showUserError(e, { useAlert: true, alertTitle: 'Camera access needed' });
      } else if (e instanceof Error && e.message === 'CAMERA_LAUNCH_FAILED') {
        Alert.alert('Error', 'Could not open the camera.');
      } else {
        showUserError(e, { useAlert: true, alertTitle: 'Error' });
      }
    } finally {
      setPickingPhoto(false);
    }
  };

  const openPhotoOptions = () => {
    if (pickingPhoto || loading) return;
    void systemActionSheet({
      title: 'Profile photo',
      message: 'Choose a source',
      actions: [
        { label: 'Take photo', onPress: () => void handleTakePhoto() },
        {
          label: 'Choose from library',
          onPress: () => void handleChooseFromLibrary(),
        },
        ...(photoUri
          ? [
              {
                label: 'Remove photo',
                destructive: true,
                onPress: () => setPhotoUri(null),
              },
            ]
          : []),
      ],
    });
  };

  const validate = (): string => {
    const nameTrim = name.trim();
    if (!nameTrim) return 'Enter your name';

    const emailTrim = email.trim();
    if (!emailTrim || !emailTrim.includes('@')) return 'Enter a valid email';
    if (!EMAIL_RE.test(emailTrim)) return 'Enter a valid email';

    if (!whatsapp.trim() || isProfilePhoneStorageEmpty(whatsapp)) {
      return 'Enter WhatsApp number';
    }
    if (!isCompleteNaProfilePhone(whatsapp)) {
      return 'Enter a complete WhatsApp number';
    }

    if (!whatsappCoordinationConsent) {
      return 'Please accept WhatsApp usage to continue.';
    }

    if (password.length < 6) return 'Password must be at least 6 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const handleSignup = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      setShowSignInCta(false);
      showError(validationError);
      return;
    }

    const nameTrim = name.trim();
    const emailTrim = email.trim().toLowerCase();

    Keyboard.dismiss();
    setLoading(true);
    setFormError(null);
    setShowSignInCta(false);
    try {
      const status = await resolveAuthEmailAccountStatus(emailTrim);
      if (status === 'exists') {
        setFormError(
          'This email already has an account. Please sign in instead.',
        );
        setShowSignInCta(true);
        return;
      }

      await signUpWithEmail({
        email: emailTrim,
        password,
        fullName: nameTrim,
        whatsapp: profilePhoneForFirestore(whatsapp),
        whatsappConsent: true,
        localPhotoUri: photoUri,
        signupIntent,
      });
      showSuccess('Account created successfully 🎉');
      const uid = auth.currentUser?.uid;
      const role = uid ? await getUserRole(uid) : 'user';
      navigateForRole(role);
    } catch (err: unknown) {
      const friendly = getAuthFlowFriendlyMessage(err);
      setFormError(friendly);
      setShowSignInCta(isEmailAlreadyInUseError(err));
      if (!isEmailAlreadyInUseError(err)) {
        showError(friendly);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardToolbar
        onFocusPrevious={focusPrev}
        onFocusNext={focusNext}
        focusedIndex={focusedIndex}
        totalInputs={REGISTER_INPUTS}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.scrollHost}>
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Create account</Text>
                <Text style={styles.cardSubtitle}>
                  {signupIntent === 'restaurant'
                    ? 'Restaurant partner account'
                    : signupIntent === 'driver'
                      ? 'Driver account'
                      : 'Add your details to get started'}
                </Text>

                <TouchableOpacity
                  style={styles.photoWrap}
                  onPress={openPhotoOptions}
                  disabled={loading || pickingPhoto}
                  activeOpacity={0.85}
                  accessibilityLabel="Add profile photo"
                >
                  {pickingPhoto ? (
                    <View style={[styles.photoEmpty, styles.photoLoading]}>
                      <ActivityIndicator size="large" color={AUTH.primary} />
                    </View>
                  ) : photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photoImage} contentFit="cover" />
                  ) : (
                    <View style={styles.photoEmpty}>
                      <MaterialIcons name="add-a-photo" size={36} color={AUTH.placeholder} />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.photoCaption}>Add profile photo (optional)</Text>

                <View style={styles.fields}>
                  <AppTextInput
                    ref={nameRef}
                    style={styles.fieldInput}
                    placeholder="Full name"
                    placeholderTextColor={AUTH.placeholder}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(0)}
                  />

                  <AppTextInput
                    ref={emailRef}
                    style={styles.fieldInput}
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
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(1)}
                  />

                  <AppTextInput
                    ref={whatsappRef}
                    style={styles.fieldInput}
                    placeholder="WhatsApp number"
                    placeholderTextColor={AUTH.placeholder}
                    value={whatsapp}
                    onChangeText={(t) => setWhatsapp(profileWhatsAppOnChangeText(t))}
                    keyboardType="phone-pad"
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(2)}
                  />

                  <Text style={styles.fieldHelper}>
                    This number is used only to coordinate pickup with other users. It will not be
                    shared publicly.
                  </Text>

                  <TouchableOpacity
                    style={styles.consentRow}
                    onPress={() => setWhatsappCoordinationConsent((v) => !v)}
                    disabled={loading}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: whatsappCoordinationConsent }}
                    accessibilityLabel="I agree to use my WhatsApp number for coordination"
                  >
                    <MaterialIcons
                      name={whatsappCoordinationConsent ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={whatsappCoordinationConsent ? AUTH.primary : AUTH.placeholder}
                      style={styles.consentIcon}
                    />
                    <Text style={styles.consentLabel}>
                      I agree to use my WhatsApp number for coordination.
                    </Text>
                  </TouchableOpacity>

                  <AppTextInput
                    ref={passwordRef}
                    style={styles.fieldInput}
                    placeholder="Password"
                    placeholderTextColor={AUTH.placeholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(3)}
                  />

                  <AppTextInput
                    ref={confirmPasswordRef}
                    style={[styles.fieldInput, styles.lastField]}
                    placeholder="Confirm password"
                    placeholderTextColor={AUTH.placeholder}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(4)}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
                  onPress={() => void handleSignup()}
                  disabled={loading}
                  activeOpacity={0.9}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Create Account</Text>
                  )}
                </TouchableOpacity>

                {formError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>{formError}</Text>
                    {showSignInCta ? (
                      <TouchableOpacity
                        style={styles.signInCtaBtn}
                        onPress={() =>
                          router.replace({
                            pathname: '/(auth)/login',
                            params: email.trim()
                              ? { email: email.trim().toLowerCase() }
                              : undefined,
                          } as never)
                        }
                        activeOpacity={0.9}
                      >
                        <Text style={styles.signInCtaText}>Go to Sign In</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerMuted}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.back()} disabled={loading} hitSlop={8}>
                  <Text style={styles.footerLink}>Log in</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AUTH.bg,
  },
  keyboardAvoid: { flex: 1, backgroundColor: '#09090B' },
  scrollHost: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: AUTH.card,
    borderRadius: 22,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(55,65,81,0.6)',
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: AUTH.text,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 15,
    color: AUTH.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 21,
  },
  photoWrap: {
    alignSelf: 'center',
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    marginTop: 20,
    borderWidth: 1,
    borderColor: AUTH.inputBorder,
    overflow: 'hidden',
    backgroundColor: AUTH.inputBg,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoLoading: {
    backgroundColor: AUTH.inputBg,
  },
  photoCaption: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: AUTH.textMuted,
    marginTop: 12,
    marginBottom: 20,
  },
  fields: {
    marginTop: 0,
    gap: 0,
  },
  fieldInput: {
    backgroundColor: '#1E2230',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 16,
    color: '#FFFFFF',
  },
  fieldHelper: {
    fontSize: 13,
    lineHeight: 19,
    color: AUTH.textMuted,
    marginTop: -2,
    marginBottom: 14,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  consentIcon: {
    marginTop: 1,
  },
  consentLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: AUTH.text,
    fontWeight: '500',
  },
  lastField: {
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: AUTH.primary,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryBtnLoading: {
    backgroundColor: '#7D8493',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  errorBanner: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  signInCtaBtn: {
    marginTop: 12,
    height: 48,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 32,
  },
  footerMuted: {
    color: AUTH.textMuted,
    fontSize: 15,
  },
  footerLink: {
    color: AUTH.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});

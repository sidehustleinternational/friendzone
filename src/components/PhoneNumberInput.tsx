import React, { useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';

interface PhoneNumberInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (formatted: string, raw: string) => void;
}

export const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({
  value,
  onChangeText,
  ...props
}) => {
  const formatPhoneNumber = (input: string): string => {
    // Remove all non-digits
    const digits = input.replace(/\D/g, '');
    
    // Limit to 10 digits (US phone numbers)
    const limitedDigits = digits.slice(0, 10);
    
    // Format as (XXX) XXX-XXXX
    if (limitedDigits.length === 0) return '';
    if (limitedDigits.length <= 3) return `(${limitedDigits}`;
    if (limitedDigits.length <= 6) return `(${limitedDigits.slice(0, 3)}) ${limitedDigits.slice(3)}`;
    return `(${limitedDigits.slice(0, 3)}) ${limitedDigits.slice(3, 6)}-${limitedDigits.slice(6)}`;
  };

  const handleChangeText = (text: string) => {
    const formatted = formatPhoneNumber(text);
    const rawDigits = text.replace(/\D/g, '');
    onChangeText(formatted, rawDigits);
  };

  return (
    <TextInput
      {...props}
      value={value}
      onChangeText={handleChangeText}
      keyboardType="phone-pad"
      placeholder="(555) 123-4567"
      maxLength={14} // (XXX) XXX-XXXX = 14 characters
    />
  );
};

// Utility function to format any phone number to display format (XXX) XXX-XXXX
export const formatPhoneNumber = (phoneNumber: string): string => {
  const digits = phoneNumber.replace(/\D/g, '');
  
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    // Handle +1 country code by removing it
    const usDigits = digits.slice(1);
    return `(${usDigits.slice(0, 3)}) ${usDigits.slice(3, 6)}-${usDigits.slice(6)}`;
  }
  
  // Return original if not standard US format
  return phoneNumber;
};

// Convert E.164 format (+1XXXXXXXXXX) to display format (XXX) XXX-XXXX
export const formatPhoneForDisplay = (e164Phone: string): string => {
  if (!e164Phone) return '';
  
  // Handle E.164 format (+1XXXXXXXXXX)
  if (e164Phone.startsWith('+1') && e164Phone.length === 12) {
    const digits = e164Phone.slice(2); // Remove +1
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  // Fallback to regular formatting
  return formatPhoneNumber(e164Phone);
};

// Convert display format (XXX) XXX-XXXX to E.164 format (+1XXXXXXXXXX)
export const formatPhoneForStorage = (displayPhone: string): string => {
  const digits = displayPhone.replace(/\D/g, '');
  
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  
  // Return original if not standard format
  return displayPhone;
};

// Utility function to extract raw digits from formatted phone
export const getPhoneDigits = (formattedPhone: string): string => {
  return formattedPhone.replace(/\D/g, '');
};

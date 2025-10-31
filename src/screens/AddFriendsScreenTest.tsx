import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { logger } from '../utils/logger';

interface Contact {
  id: string;
  name: string;
  phoneNumbers?: Array<{number?: string; digits?: string}>;
}

export default function AddFriendsScreenTest() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') return;

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      const contactsWithPhones = data
        .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map(contact => ({
          id: contact.id,
          name: contact.name || 'Unknown',
          phoneNumbers: contact.phoneNumbers,
        }))
        .slice(0, 200);

      setContacts(contactsWithPhones);
      logger.debug(`✅ TEST: Loaded ${contactsWithPhones.length} contacts`);
    } catch (error) {
      logger.error('Error loading contacts:', error);
    }
  };

  // WORKING CONTACTS FILTER
  const filteredContacts = React.useMemo(() => {
    logger.debug(`🔍 TEST FILTERING: query="${searchQuery}", contacts=${contacts.length}`);
    
    if (!searchQuery.trim()) {
      return contacts;
    }
    
    const query = searchQuery.toLowerCase().trim();
    const result = contacts.filter(contact => {
      const name = contact.name.toLowerCase();
      return name.includes(query);
    });
    
    logger.debug(`🔍 TEST RESULT: ${result.length}/${contacts.length} contacts match "${query}"`);
    return result;
  }, [contacts, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>🧪 CONTACTS FILTER TEST</Text>
      
      <Text style={styles.debug}>
        Query: "{searchQuery}" | Results: {filteredContacts.length}/{contacts.length}
      </Text>
      
      <TextInput
        style={styles.searchInput}
        placeholder="Search contacts..."
        value={searchQuery}
        onChangeText={(text) => {
          logger.debug(`🔍 TEST INPUT: "${searchQuery}" → "${text}"`);
          setSearchQuery(text);
        }}
        autoCorrect={false}
        autoCapitalize="none"
      />

      <ScrollView style={styles.contactsList}>
        {filteredContacts.map(contact => (
          <View key={contact.id} style={styles.contactItem}>
            <Text style={styles.contactName}>{contact.name}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  debug: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: 'monospace',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
    marginBottom: 10,
  },
  contactsList: {
    flex: 1,
  },
  contactItem: {
    backgroundColor: '#FFF',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
  },
});

import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  ScrollView, SafeAreaView, Platform, Linking, Alert 
} from 'react-native';
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import Voice from '@react-native-voice/voice';

// ডিফল্ট অফলাইন মেমোরি বেস
const DEFAULT_MEMORY = {
  "bn_to_bn": {
    "তুমি কে": "আমি আরিয়ান, আপনার ভয়েস অ্যাসিস্ট্যান্ট।",
    "কেমন আছো": "আমি ভালো আছি! আপনি কেমন আছেন?",
    "হ্যালো": "নমস্কার! বলুন আপনাকে কীভাবে সাহায্য করতে পারি?"
  }
};

export default function App() {
  const [messages, setMessages] = useState([
    { id: 1, text: "নমস্কার! আমি আরিয়ান AI। ফোনের মাইক্রোফোনে চাপ দিয়ে কথা বলুন বা টাইপ করুন।", sender: "ai" }
  ]);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const scrollViewRef = useRef();

  useEffect(() => {
    // লোকাল স্টোরেজ ডাটাবেস ইনিশিয়ালাইজ করা
    initDatabase();
    
    // ভয়েস রিকগনিশন হ্যান্ডলার সেটআপ
    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechResults = onSpeechResultsHandler;

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const initDatabase = async () => {
    try {
      const existingData = await AsyncStorage.getItem('aryan_memory');
      if (!existingData) {
        await AsyncStorage.setItem('aryan_memory', JSON.stringify(DEFAULT_MEMORY));
      }
    } catch (e) {
      console.error("ডাটাবেস লোড করতে ত্রুটি:", e);
    }
  };

  // স্পিচ-টু-টেক্সট (ভয়েস ইনপুট) হ্যান্ডলার
  const onSpeechResultsHandler = (e) => {
    if (e.value && e.value[0]) {
      const voiceText = e.value[0].trim();
      setInputText(voiceText);
      handleProcessMessage(voiceText);
    }
  };

  const startVoiceInput = async () => {
    try {
      setInputText("");
      await Voice.start('bn-IN'); // বাংলা ভয়েস ইনপুট
    } catch (e) {
      Alert.alert("ত্রুটি", "মাইক্রোফোন চালু করা যাচ্ছে না। পারমিশন চেক করুন।");
    }
  };

  // ওএস-লেভেল কাস্টম কমান্ড রাউটার (Deep Linking)
  const handleSystemCommand = (text) => {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes("হোয়াটসঅ্যাপ") || lowerText.includes("whatsapp")) {
      speak("হোয়াটসঅ্যাপ খোলা হচ্ছে");
      Linking.openURL('whatsapp://').catch(() => {
        Alert.alert("ত্রুটি", "আপনার ফোনে হোয়াটসঅ্যাপ ইনস্টল করা নেই।");
      });
      return true;
    }
    
    if (lowerText.includes("ইউটিউব") || lowerText.includes("youtube")) {
      speak("ইউটিউব খোলা হচ্ছে");
      Linking.openURL('https://youtube.com').catch(() => {
        Alert.alert("ত্রুটি", "ইউটিউব খোলা যাচ্ছে না।");
      });
      return true;
    }
    
    return false;
  };

  // মূল অনলাইন-অফলাইন হাইব্রিড এআই লজিক
  const handleProcessMessage = async (textToProcess) => {
    const query = textToProcess || inputText;
    if (!query.trim()) return;

    // স্ক্রিনে ইউজারের মেসেজ যোগ করা
    const userMsg = { id: Date.now(), text: query, sender: "user" };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");

    // ১. প্রথমে চেক করবে ওএস সিস্টেম কমান্ড কি না
    if (handleSystemCommand(query)) return;

    // নেটওয়ার্কের অবস্থা পরীক্ষা করা
    const netState = await NetInfo.fetch();
    const storedData = await AsyncStorage.getItem('aryan_memory');
    let dict = storedData ? JSON.parse(storedData) : DEFAULT_MEMORY;
    let cleanText = query.replace(/\?/g, "").trim();

    // ২. লোকাল অফলাইন মেমোরিতে উত্তর থাকলে সরাসরি সেখান থেকে দেবে
    if (dict["bn_to_bn"][cleanText]) {
      const reply = dict["bn_to_bn"][cleanText];
      respondAsAI(reply);
    } 
    // ৩. অফলাইনে না থাকলে এবং ইন্টারনেট থাকলে সরাসরি অনলাইন থেকে ডেটা আনবে
    else if (netState.isConnected && netState.isInternetReachable) {
      respondAsAI("লোকাল মেমোরিতে নেই, অনলাইন সার্ভার থেকে খুঁজছি...");
      
      try {
        let url = `https://wikipedia.org{encodeURIComponent(cleanText)}`;
        let response = await fetch(url);
        
        if (response.ok) {
          let data = await response.json();
          let onlineAns = data.extract || "অনলাইন সার্ভারে এই তথ্যের সঠিক উত্তর খুঁজে পাইনি।";
          
          respondAsAI(onlineAns);
          
          // [লার্নিং মেকানিজম]: অনলাইন থেকে পাওয়া উত্তরটি ভবিষ্যতে অফলাইনে ব্যবহারের জন্য ডাটাবেসে সেভ করা
          dict["bn_to_bn"][cleanText] = onlineAns;
          await AsyncStorage.setItem('aryan_memory', JSON.stringify(dict));
        } else {
          throw new Error("Data not found");
        }
      } catch (e) {
        respondAsAI(`দুঃখিত, ইন্টারনেট সার্চেও '${query}' সম্পর্কে স্পষ্ট কিছু পেলাম না।`);
      }
    } 
    // ৪. ইন্টারনেটও বন্ধ এবং লোকাল অফলাইন মেমোরিতেও তথ্য নেই
    else {
      respondAsAI(`উঁহুঁ... আমি এখনো '${query}' চিনি না এবং আপনার ইন্টারনেটও বন্ধ!`);
    }
  };

  const respondAsAI = (replyText) => {
    const aiMsg = { id: Date.now() + 1, text: replyText, sender: "ai" };
    setMessages(prev => [...prev, aiMsg]);
    speak(replyText);
  };

  // টেক্সট-টু-স্পিচ (ভয়েস আউটপুট)
  const speak = (text) => {
    Speech.stop();
    Speech.speak(text, {
      language: 'bn-IN', // বাংলা উচ্চারণ
      pitch: 1.0,
      rate: 1.0
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Aryan AI</Text>
      </View>

      <ScrollView 
        style={styles.chatContainer}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current.scrollToEnd({ animated: true })}
      >
        {messages.map(msg => (
          <View key={msg.id} style={[styles.message, msg.sender === 'user' ? styles.userMsg : styles.aiMsg]}>
            <Text style={styles.messageText}>{msg.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputArea}>
        <TextInput 
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="এখানে লিখুন বা মুখে বলুন..."
        />
        <TouchableOpacity style={[styles.btn, isListening && styles.btnActive]} onPress={startVoiceInput}>
          <Text style={styles.btnText}>🎙️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => handleProcessMessage(null)}>
          <Text style={styles.btnText}>➡️</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5ddd5' },
  header: { background: '#075e54', padding: 16, alignItems: 'center', elevation: 4 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  chatContainer: { flex: 1, padding: 12 },
  message: { maxWidth: '80%', padding: 12, borderRadius: 12, marginBottom: 10 },
  userMsg: { backgroundColor: '#dcf8c6', alignSelf: 'flex-end' },
  aiMsg: { backgroundColor: 'white', alignSelf: 'flex-start' },
  messageText: { fontSize: 16, color: '#333', lineHeight: 22 },
  inputArea: { flexDirection: 'row', padding: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  input: { flex: 1, backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, fontSize: 16, borderWidth: 1, borderColor: '#ccc' },
  btn: { width: 46, height: 46, backgroundColor: '#075e54', borderRadius: 23, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  btnActive: { backgroundColor: 'red' },
  btnText: { fontSize: 18, color: 'white' }
});

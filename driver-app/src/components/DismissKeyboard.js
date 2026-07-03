import React from 'react';
import { TouchableWithoutFeedback, Keyboard, View } from 'react-native';

export default function DismissKeyboard({ children, style }) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

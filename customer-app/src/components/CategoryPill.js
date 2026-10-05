import React from 'react';
import { Chip } from './UI';

// متوافق مع الاستدعاءات القديمة — يعتمد Chip الموحّد
export default function CategoryPill({ item, selected, onPress }) {
  return <Chip emoji={item.icon} label={item.name_ar} selected={selected} onPress={onPress} />;
}

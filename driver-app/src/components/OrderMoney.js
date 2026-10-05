// بطاقة المال والتفاصيل — تُستخدم في نافذة العرض وشاشة التوصيل
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, RTL, RADIUS, SHADOW } from '../theme';
import { Pulse, Press } from './Anim';
import { money, cashToCollect, paymentLabel, driverFee, tipOf, num, parseItems, isPersonal } from '../utils/format';

// شارة "اقبض من الزبون" — ذهبية بنص داكن (تباين عالٍ يُقرأ بنظرة أثناء القيادة)
export function CashBadge({ order, size = 'lg' }) {
  const cash = cashToCollect(order);
  const big = size === 'lg';
  if (cash > 0) {
    return (
      <LinearGradient colors={GRADIENTS.gold} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.cash, !big && styles.cashSm, big && SHADOW.soft]}
        accessibilityLabel={`اقبض من الزبون ${money(cash)}`}>
        <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.cashSheen} pointerEvents="none" />
        <Pulse to={1.06} duration={900}>
          <View style={[styles.cashIcon, !big && { width: 40, height: 40, borderRadius: 13 }]}>
            <Ionicons name="cash" size={big ? 24 : 19} color={COLORS.amber} />
          </View>
        </Pulse>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cashLabel, RTL.text]}>اقبض من الزبون نقداً</Text>
          <Text style={[styles.cashAmount, !big && { fontSize: 24 }, RTL.text]} numberOfLines={1} adjustsFontSizeToFit>{money(cash)}</Text>
        </View>
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.paid, !big && { paddingVertical: 10 }]} accessibilityLabel="مدفوع مسبقاً، لا تحصّل أي مبلغ">
      <View style={styles.paidIcon}><Ionicons name="shield-checkmark" size={16} color="#FFF" /></View>
      <Text style={[styles.paidText, RTL.text]}>مدفوع مسبقاً — لا تحصّل أي مبلغ</Text>
    </View>
  );
}

function Row({ icon, label, value, color, strong, last }) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <View style={[RTL.row, { gap: 10, flex: 1 }]}>
        <View style={styles.rowIcon}><Ionicons name={icon} size={15} color={color || COLORS.sub} /></View>
        <Text style={[styles.rowLabel, RTL.text]}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, color && { color }, strong && { fontSize: 16.5 }]}>{value}</Text>
    </View>
  );
}

export default function OrderMoney({ order, showItems = true, maxItems = 99, showCash = true }) {
  const [expanded, setExpanded] = useState(false);
  if (!order) return null;
  const items = parseItems(order);
  const tip = tipOf(order);
  const shown = expanded ? items : items.slice(0, maxItems);
  const hidden = items.length - shown.length;
  const total = num(order.total);

  return (
    <View>
      {showCash && <CashBadge order={order} />}
      <View style={styles.box}>
        {total > 0 && <Row icon="receipt-outline" label="إجمالي الطلب" value={money(total)} strong />}
        <Row icon="card-outline" label="طريقة الدفع" value={paymentLabel(order.payment_method)} />
        <Row icon="bicycle" label="أجرك من التوصيل" value={money(driverFee(order))} color={COLORS.greenDeep} strong last={!(tip > 0)} />
        {tip > 0 && <Row icon="heart" label="إكرامية من الزبون" value={`+${money(tip)}`} color={COLORS.primary} last />}
      </View>

      {showItems && !isPersonal(order) && items.length > 0 && (
        <View style={styles.box}>
          <View style={[RTL.row, { justifyContent: 'space-between', paddingTop: 10, paddingBottom: 6 }]}>
            <Text style={[styles.boxTitle, RTL.text]}>الأصناف</Text>
            <View style={styles.countPill}><Text style={styles.countText}>{items.reduce((s, i) => s + i.qty, 0)} قطعة</Text></View>
          </View>
          {shown.map(it => (
            <View key={it.key} style={styles.item}>
              <View style={styles.qty}><Text style={styles.qtyText}>{it.qty}×</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, RTL.text]}>{it.name}</Text>
                {it.options.length > 0 && <Text style={[styles.itemOpts, RTL.text]}>{it.options.join('، ')}</Text>}
                {!!it.notes && (
                  <View style={[RTL.row, { gap: 4, marginTop: 3 }]}>
                    <Ionicons name="create-outline" size={12} color={COLORS.amberDeep} />
                    <Text style={[styles.itemNote, RTL.text]}>{it.notes}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
          {hidden > 0 && (
            <Press onPress={() => setExpanded(true)} style={styles.more} accessibilityLabel={`عرض ${hidden} أصناف أخرى`}>
              <Text style={styles.moreText}>+{hidden} أصناف أخرى</Text>
              <Ionicons name="chevron-down" size={14} color={COLORS.primary} />
            </Press>
          )}
        </View>
      )}

      {!!order.notes && (
        <View style={[styles.notes, RTL.row]}>
          <View style={styles.notesIcon}><Ionicons name="chatbox-ellipses" size={16} color="#FFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.notesTitle, RTL.text]}>ملاحظات الزبون</Text>
            <Text style={[styles.notesText, RTL.text]}>{order.notes}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cash: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderRadius: RADIUS.lg - 2, padding: 16, marginBottom: 10, overflow: 'hidden', backgroundColor: COLORS.amber },
  cashSm: { padding: 12, borderRadius: RADIUS.md, gap: 12 },
  cashSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  cashIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  cashLabel: { color: 'rgba(20,20,43,0.78)', fontSize: 13, fontWeight: '800' },
  cashAmount: { color: COLORS.ink, fontSize: 32, fontWeight: '900', marginTop: 1 },
  paid: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: COLORS.greenSoft, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.greenLine },
  paidIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  paidText: { color: COLORS.greenDeep, fontWeight: '800', fontSize: 13.5, flex: 1 },
  box: { backgroundColor: COLORS.inputBg, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: COLORS.line },
  boxTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  countPill: { backgroundColor: COLORS.tint, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { color: COLORS.primary, fontWeight: '800', fontSize: 11.5 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  rowIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 13.5, color: COLORS.sub, fontWeight: '500' },
  rowValue: { fontSize: 14.5, fontWeight: '800', color: COLORS.text },
  item: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.line },
  qty: { minWidth: 36, paddingHorizontal: 6, height: 26, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#FFF', fontWeight: '900', fontSize: 12.5 },
  itemName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  itemOpts: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  itemNote: { fontSize: 12, color: COLORS.amberDeep, flex: 1, fontWeight: '500' },
  more: { paddingVertical: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 4, borderTopWidth: 1, borderTopColor: COLORS.line },
  moreText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  notes: { gap: 10, alignItems: 'flex-start', backgroundColor: COLORS.amberSoft, borderRadius: RADIUS.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#FFE3A3' },
  notesIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.amber, alignItems: 'center', justifyContent: 'center' },
  notesTitle: { fontSize: 12.5, fontWeight: '800', color: COLORS.amberDeep },
  notesText: { fontSize: 14, color: COLORS.text, marginTop: 2, lineHeight: 21 },
});

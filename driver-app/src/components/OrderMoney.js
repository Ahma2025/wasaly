// بطاقة المال والتفاصيل — تُستخدم في نافذة العرض وشاشة التوصيل
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, RTL } from '../theme';
import { money, cashToCollect, paymentLabel, driverFee, tipOf, num, parseItems, isPersonal } from '../utils/format';

export function CashBadge({ order, size = 'lg' }) {
  const cash = cashToCollect(order);
  const big = size === 'lg';
  if (cash > 0) {
    return (
      <LinearGradient colors={GRADIENTS.gold} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.cash, !big && styles.cashSm]}>
        <View style={styles.cashIcon}><Ionicons name="cash" size={big ? 26 : 20} color="#FFF" /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cashLabel, RTL.text]}>اقبض من الزبون</Text>
          <Text style={[styles.cashAmount, !big && { fontSize: 24 }, RTL.text]}>{money(cash)}</Text>
        </View>
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.paid, !big && { paddingVertical: 10 }]}>
      <Ionicons name="checkmark-circle" size={20} color={COLORS.greenDeep} />
      <Text style={[styles.paidText, RTL.text]}>مدفوع مسبقاً — لا تحصّل أي مبلغ</Text>
    </View>
  );
}

function Row({ icon, label, value, color, strong }) {
  return (
    <View style={styles.row}>
      <View style={[RTL.row, { gap: 8, flex: 1 }]}>
        <Ionicons name={icon} size={16} color={COLORS.gray} />
        <Text style={[styles.rowLabel, RTL.text]}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, color && { color }, strong && { fontSize: 16 }]}>{value}</Text>
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
        <Row icon="bicycle-outline" label="أجرك من التوصيل" value={money(driverFee(order))} color={COLORS.green} strong />
        {tip > 0 && <Row icon="heart-outline" label="إكرامية من الزبون" value={`+${money(tip)}`} color={COLORS.primary} />}
      </View>

      {showItems && !isPersonal(order) && items.length > 0 && (
        <View style={styles.box}>
          <Text style={[styles.boxTitle, RTL.text]}>الأصناف ({items.reduce((s, i) => s + i.qty, 0)})</Text>
          {shown.map(it => (
            <View key={it.key} style={styles.item}>
              <View style={styles.qty}><Text style={styles.qtyText}>{it.qty}×</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, RTL.text]}>{it.name}</Text>
                {it.options.length > 0 && <Text style={[styles.itemOpts, RTL.text]}>{it.options.join('، ')}</Text>}
                {!!it.notes && <Text style={[styles.itemNote, RTL.text]}>📝 {it.notes}</Text>}
              </View>
            </View>
          ))}
          {hidden > 0 && (
            <TouchableOpacity onPress={() => setExpanded(true)} style={styles.more}>
              <Text style={styles.moreText}>+{hidden} أصناف أخرى</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!order.notes && (
        <View style={[styles.notes, RTL.row]}>
          <Ionicons name="chatbox-ellipses" size={18} color={COLORS.amber} />
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
  cash: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, marginBottom: 10 },
  cashSm: { padding: 12, borderRadius: 16 },
  cashIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  cashLabel: { color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: '700' },
  cashAmount: { color: '#FFF', fontSize: 30, fontWeight: '900' },
  paid: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: COLORS.greenSoft, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10 },
  paidText: { color: COLORS.greenDeep, fontWeight: '800', fontSize: 13, flex: 1 },
  box: { backgroundColor: COLORS.inputBg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10 },
  boxTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontSize: 13, color: COLORS.sub, fontWeight: '600' },
  rowValue: { fontSize: 14, fontWeight: '900', color: COLORS.text },
  item: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: COLORS.line },
  qty: { minWidth: 34, paddingHorizontal: 6, height: 24, borderRadius: 8, backgroundColor: COLORS.tint, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: COLORS.primary, fontWeight: '900', fontSize: 12 },
  itemName: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  itemOpts: { fontSize: 11.5, color: COLORS.gray, marginTop: 2 },
  itemNote: { fontSize: 11.5, color: COLORS.amber, marginTop: 2 },
  more: { paddingVertical: 8, alignItems: 'center' },
  moreText: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  notes: { gap: 10, alignItems: 'flex-start', backgroundColor: COLORS.amberSoft, borderRadius: 16, padding: 12, marginBottom: 10 },
  notesTitle: { fontSize: 12, fontWeight: '800', color: COLORS.amber },
  notesText: { fontSize: 13.5, color: COLORS.text, marginTop: 2, lineHeight: 20 },
});

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { ScrollView, View } from 'react-native';

/*
  قائمة أفقية RTL (التطبيق مثبّت LTR والترتيب row-reverse يدوي):
  - المحتوى row-reverse + flexGrow:1 + justifyContent:'flex-start' → أول عنصر على اليمين، والقوائم القصيرة تلزق يمين
  - كل ما تغيّر حجم المحتوى (وقبل ما يسحب المستخدم بإيده) → نرجع لبداية القائمة (scrollToEnd بالـ RTL)
  - activeIndex: يسكرول العنصر المختار لمنتصف الشاشة (مثل قسم الماركت أو العنوان المختار بالسلة)
*/
function RtlHScroll({ children, contentContainerStyle, activeIndex, style, onScrollBeginDrag, ...rest }, ref) {
  const sv = useRef(null);
  const userMoved = useRef(false);
  const viewW = useRef(0);
  const contentW = useRef(0);
  const items = useRef({});

  useImperativeHandle(ref, () => ({
    scrollTo: (o) => sv.current?.scrollTo(o),
    scrollToEnd: (o) => sv.current?.scrollToEnd(o),
    scrollToStart: (animated = true) => sv.current?.scrollToEnd({ animated }),
  }));

  const centerOn = useCallback((i, animated) => {
    const l = items.current[i];
    if (!l || !viewW.current || !sv.current) return false;
    const max = Math.max(0, contentW.current - viewW.current);
    const x = Math.min(max, Math.max(0, l.x + l.width / 2 - viewW.current / 2));
    sv.current.scrollTo({ x, animated });
    return true;
  }, []);

  const align = useCallback((animated = false) => {
    if (!viewW.current || !contentW.current) return;
    if (activeIndex != null && centerOn(activeIndex, animated)) return;
    sv.current?.scrollToEnd({ animated });
  }, [activeIndex, centerOn]);

  useEffect(() => {
    // اختيار جديد (مثلاً من الرئيسية) → يظهر العنصر المختار
    if (activeIndex != null) centerOn(activeIndex, true);
  }, [activeIndex, centerOn]);

  const list = React.Children.toArray(children).filter(Boolean);
  return (
    <ScrollView
      {...rest}
      ref={sv}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      onScrollBeginDrag={(e) => { userMoved.current = true; onScrollBeginDrag && onScrollBeginDrag(e); }}
      onLayout={(e) => {
        viewW.current = e.nativeEvent.layout.width;
        if (!userMoved.current) align(false);
        rest.onLayout && rest.onLayout(e);
      }}
      onContentSizeChange={(w, h) => {
        contentW.current = w;
        if (!userMoved.current) align(false);
        rest.onContentSizeChange && rest.onContentSizeChange(w, h);
      }}
      contentContainerStyle={[{ flexGrow: 1, justifyContent: 'flex-start' }, contentContainerStyle, { flexDirection: 'row-reverse' }]}>
      {activeIndex == null ? list : list.map((c, i) => (
        <View key={c.key ?? i} onLayout={(e) => {
          items.current[i] = e.nativeEvent.layout;
          if (i === activeIndex && !userMoved.current) centerOn(i, false);
        }}>
          {c}
        </View>
      ))}
    </ScrollView>
  );
}

export default forwardRef(RtlHScroll);

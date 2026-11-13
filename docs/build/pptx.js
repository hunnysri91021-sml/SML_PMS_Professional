const pptxgen=require('/tmp/claude-0/-home-user-SML-PMS-Professional/6d240ac8-cd9a-594e-9346-62773b60b373/scratchpad/node_modules/pptxgenjs');
const IMG='/home/user/SML_PMS_Professional/docs/manual/img/';
const pres=new pptxgen(); pres.layout='LAYOUT_16x9'; pres.title='คู่มือการใช้งาน SML PMS ฉบับสมบูรณ์';
const NAVY='12355B',TEAL='0E7C86',ORG='F59E0B',LIGHT='EEF4F8',INK='1F2937',MUTE='6B7280',F='Calibri';
const sec=(t,sub,n)=>{const s=pres.addSlide();s.background={color:NAVY};
 s.addText(String(n),{x:0.6,y:1.2,w:2,h:1.4,fontFace:F,fontSize:80,bold:true,color:ORG,margin:0,isTextBox:true});
 s.addText(t,{x:0.6,y:2.7,w:8.8,h:0.9,fontFace:F,fontSize:38,bold:true,color:'FFFFFF',margin:0,isTextBox:true});
 s.addText(sub,{x:0.6,y:3.6,w:8.8,h:0.7,fontFace:F,fontSize:18,color:'CADCFC',margin:0,isTextBox:true});};
const step=(title,img,bul,note)=>{const s=pres.addSlide();s.background={color:'FFFFFF'};
 s.addText(title,{x:0.5,y:0.3,w:9,h:0.7,fontFace:F,fontSize:28,bold:true,color:NAVY,margin:0,isTextBox:true});
 s.addShape(pres.ShapeType.roundRect,{x:4.2,y:1.15,w:5.4,h:3.375+0.0,fill:{color:LIGHT},rectRadius:0.1,line:{color:'CBD5E1',width:1}});
 s.addImage({path:IMG+img,x:4.28,y:1.2,w:5.24,h:3.275});
 s.addText(bul.map((t,i)=>({text:t,options:{bullet:true,breakLine:i<bul.length-1,paraSpaceAfter:8}})),{x:0.5,y:1.2,w:3.5,h:3.6,fontFace:F,fontSize:15,color:INK,valign:'top',margin:0,isTextBox:true});
 if(note){s.addShape(pres.ShapeType.roundRect,{x:0.5,y:4.75,w:9.1,h:0.55,fill:{color:'FEF3C7'},rectRadius:0.08,line:{color:'FEF3C7'}});
  s.addText('💡 '+note,{x:0.65,y:4.75,w:8.8,h:0.55,fontFace:F,fontSize:13,color:'92400E',valign:'middle',margin:0,isTextBox:true});}};
// cover
let s=pres.addSlide();s.background={color:NAVY};
s.addText('SML PMS',{x:0.6,y:1.3,w:8.8,h:1,fontFace:F,fontSize:60,bold:true,color:'FFFFFF',margin:0,isTextBox:true});
s.addText('คู่มือการใช้งานฉบับสมบูรณ์',{x:0.6,y:2.4,w:8.8,h:0.7,fontFace:F,fontSize:32,color:ORG,bold:true,margin:0,isTextBox:true});
s.addText('ระบบประเมินผลการปฏิบัติงานประจำปี — สำหรับพนักงานและผู้ประเมิน (หัวหน้า L1–L4)\nภาพประกอบจากโปรแกรมจริง',{x:0.6,y:3.3,w:8.8,h:0.9,fontFace:F,fontSize:18,color:'CADCFC',margin:0,isTextBox:true});
// overview
s=pres.addSlide();s.background={color:'FFFFFF'};
s.addText('ภาพรวมขั้นตอนการประเมิน',{x:0.5,y:0.3,w:9,h:0.7,fontFace:F,fontSize:28,bold:true,color:NAVY,margin:0,isTextBox:true});
const fl=[['1','พนักงานประเมินตนเอง'],['2','หัวหน้าหน่วย (L1)\nประเมินรอบแรก'],['3','หัวหน้าแผนก (L2)\nสอบทาน'],['4','ผจก.ส่วน (L3)\nสอบทาน'],['5','GM (L4)\nอนุมัติ + ส่งผล'],['6','พนักงาน\nรับทราบผล'],['7','HR Calibration\n→ MD อนุมัติ']];
fl.forEach((f,i)=>{const x=0.5+i*1.3;
 s.addShape(pres.ShapeType.ellipse,{x:x+0.3,y:1.4,w:0.6,h:0.6,fill:{color:i<6?TEAL:ORG},line:{color:'FFFFFF'}});
 s.addText(f[0],{x:x+0.3,y:1.4,w:0.6,h:0.6,fontFace:F,fontSize:20,bold:true,color:'FFFFFF',align:'center',valign:'middle',margin:0,isTextBox:true});
 s.addText(f[1],{x:x-0.05,y:2.1,w:1.3,h:0.9,fontFace:F,fontSize:12,color:INK,align:'center',valign:'top',margin:0,isTextBox:true});});
s.addText([{text:'ขั้นที่ 1–6 คือส่วนที่พนักงานและหัวหน้าเกี่ยวข้อง\n',options:{bold:true,breakLine:true}},{text:'คะแนนรวม X = Y (ผลงาน) + Z (เวลาทำงาน) [+ KPI] • เกรด A–E จะแสดงหลัง MD อนุมัติขั้นสุดท้ายและเมื่อ Admin เปิดให้เห็นเท่านั้น • ถ้าสายบังคับบัญชาไม่มีบางขั้น ระบบจะข้ามขั้นนั้นให้อัตโนมัติ'}],{x:0.5,y:3.3,w:9,h:1.6,fontFace:F,fontSize:16,color:INK,margin:0,isTextBox:true});

sec('เริ่มต้นใช้งาน','เข้าสู่ระบบ • เปิดใช้งานครั้งแรก • ลืม PIN • ลงทะเบียน LINE',1);
step('เข้าสู่ระบบ','a1-login.png',['กรอกรหัสพนักงาน แล้วกรอก PIN','กดไอคอนตาเพื่อแสดง/ซ่อน PIN','ผิดซ้ำ 5 ครั้ง ระบบล็อก 15 นาที','เมนูด้านล่างฟอร์มสำหรับผู้ใช้ใหม่/ลืม PIN'],'ถ้าระบบแจ้ง "ยังไม่เปิดใช้บริการ" แสดงว่า Admin ปิดระบบชั่วคราว');
step('เปิดใช้งานครั้งแรก','a2-activate.png',['ขอ "รหัสเปิดใช้งาน" จาก HR','กรอกรหัสพนักงาน + รหัสเปิดใช้งาน','รับ OTP 6 หลักทางอีเมล แล้วตั้ง PIN 4–6 หลัก'],'รหัสเปิดใช้งานใช้ได้ครั้งเดียวและมีวันหมดอายุ');
step('ลืม PIN — ตั้งเองได้','a3-forgot.png',['กด "ลืม PIN?" ที่หน้าเข้าสู่ระบบ','ระบบส่ง OTP ไปอีเมลที่ HR ลงไว้','กรอก OTP + PIN ใหม่ 2 ครั้ง'],'ไม่มีอีเมลในระบบ → ติดต่อ HR');
step('ลงทะเบียนอีเมล และ LINE','a4-regemail.png',['ผู้ยังไม่มี PIN ลงทะเบียนอีเมลเองได้','HR ตรวจแล้วจึงส่ง PIN ให้ทางอีเมล','LINE: เพิ่มเพื่อน OA แล้วพิมพ์รหัสพนักงาน เพื่อรับแจ้งเตือน/รับทราบผลผ่าน LINE'],'ใช้อีเมลบริษัทที่ถูกต้อง เพราะ OTP จะส่งไปที่นี่');

sec('สำหรับพนักงาน','ประเมินตนเอง • ดูผล • รับทราบ • ขอหารือ',2);
step('หน้าแรกของพนักงาน','b0-home.png',['เมนูที่เห็น: 1. ประเมินตนเอง และ 8. ผลประเมิน','กระดิ่งมุมขวาบนแจ้งเตือนสถานะ'],null);
step('1. ประเมินตนเอง','b1-selfeval.png',['รหัสและชื่อถูกกรอกให้อัตโนมัติ','แบบฟอร์มถูกกำหนดโดย Admin ตามตำแหน่ง','ถ้าไม่มีสิทธิ์ประเมิน ปุ่มจะเป็นสีเทา'],'ไม่มีสิทธิ์ → ติดต่อ HR');
step('ให้คะแนนแต่ละหัวข้อ','b2-scoring.png',['เลือกระดับ A+ / A / B / C+ / C ของแต่ละข้อ','ระบบรวมคะแนนผลงาน (Y) ให้ทันที','คะแนนเวลาทำงาน (Z) มาจากข้อมูลเวลาของ HR — แก้เองไม่ได้'],null);
step('ตรวจสรุปคะแนน','b3-summary.png',['ดูคะแนนดิบ / Y / Z / X ก่อนส่ง','กด "บันทึกร่าง" เพื่อกลับมาแก้ภายหลังได้','ยังไม่มีเกรด — เกรดจะประกาศหลังอนุมัติขั้นสุดท้าย'],null);
step('เขียนความเห็น และพิมพ์ร่าง','b4-comments.png',['จุดเด่น/ผลงาน และสิ่งที่ควรพัฒนา','กด "พิมพ์ร่าง" เพื่อบันทึกเป็น PDF'],null);
step('ยืนยันส่งแบบประเมิน','b5-confirm.png',['ตรวจคะแนนรวมและ "ส่งถึง" (หัวหน้า)','ส่งแล้วแก้ไขไม่ได้ จนกว่าหัวหน้าตีกลับ'],'ถ้าถูกตีกลับ ต้องแก้คะแนนหรือยืนยันผลเดิมพร้อมเหตุผลก่อนส่งใหม่');
step('ถูกตีกลับ — ต้องทำอะไร','b9-rejected.png',['อ่านเหตุผลที่หัวหน้าตีกลับในแถบเตือน','คะแนนเดิมยังแสดงอยู่ให้เทียบ','แก้คะแนน หรือกด "ยืนยันว่าตรวจสอบแล้ว"'],null);
step('8. ผลประเมินของฉัน','b6-result.png',['เห็นคะแนน X/Y/Z หลัง GM อนุมัติและส่งผล','เกรดแสดงเมื่อ MD อนุมัติและ Admin เปิดให้เห็น','กด "รับทราบผล" หรือโหลดใบประเมิน PDF'],'รับทราบได้ทั้งบนเว็บและผ่านปุ่มใน LINE');
step('ไม่เห็นด้วยกับผล — ขอหารือ','b7-dispute.png',['เลือก "ไม่ยอมรับผล/ขอหารือ" พร้อมเหตุผล','เสนอวันที่สะดวก 1–3 วัน','หัวหน้ายืนยันวัน HR บันทึกผลการหารือ','หรือเลือก "รับทราบพร้อมความเห็นต่าง"'],null);
step('การแจ้งเตือน','b8-bell.png',['กระดิ่งแสดงงานที่เกี่ยวข้องกับคุณ','ข้อมูลในกระดิ่งแสดงเฉพาะสายงานของคุณ'],null);

sec('สำหรับหัวหน้า (L1–L4)','ประเมินทีม • สอบทาน • ตีกลับ • อนุมัติและส่งผล',3);
step('2. ประเมินทีมงาน (หัวหน้าหน่วย L1)','c1-team.png',['ดูลูกทีมและสถานะรายคน','กด "ประเมิน" เพื่อเปิดฟอร์ม','"บันทึกไว้ก่อน" แล้วรวมหลายคนกด "ส่ง" ทีเดียวได้','Export Excel รายชื่อทีมพร้อมข้อมูลเวลา'],null);
step('ฟอร์มสอบทาน — คะแนนและเวลา','c2-reviewform.png',['ดูข้อมูลพนักงานและรายละเอียดเวลาทำงาน (Z)','ให้คะแนนแต่ละข้อ ระบบรวม Y/X ทันที','เห็นความเห็นของผู้ประเมินคนก่อนหน้า'],null);
step('ความเห็นและสายอนุมัติ','c3-reviewform2.png',['เขียนความเห็นของคุณ','ดูลายเซ็นแต่ละขั้นพร้อมวันที่','ปุ่ม: ตีกลับ • บันทึกไว้ก่อน • ยืนยันและส่งต่อ'],'ส่งต่อแล้วแก้ไขไม่ได้ — ระบบถามยืนยันและแจ้งผู้ประเมินคนถัดไป');
step('3. สอบทานหัวหน้าแผนก (L2)','c4-queue-l2.png',['คิวแสดงคนที่ถึงขั้นของคุณ + คนที่ยังรอ','กรองตามฝ่าย/ส่วน/แผนก/กลุ่ม และเรียงคะแนน','ติ๊กเลือกหลายคนแล้ว "อนุมัติ" หรือ "ตีกลับ"'],'ตีกลับต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร');
step('4. สอบทานผู้จัดการส่วน (L3)','c7-queue-l3.png',['หน้าตาเหมือนขั้น L2','คอลัมน์ Y · Z · X แยกชัดเจน','ไม่แสดงเกรดชั่วคราว'],null);
step('5. อนุมัติ GM (L4)','c8-queue-gm.png',['GM อนุมัติใบที่ผ่านการสอบทาน','ดูแบบฟอร์มได้ก่อนอนุมัติ'],null);
step('GM ยืนยันส่งผลให้พนักงาน','c9-gm-send.png',['หลังอนุมัติ ใบจะรอ "ยืนยันส่งผล"','กดส่ง → พนักงานเห็นผลและได้รับอีเมล/LINE','พนักงานจึงรับทราบผลได้'],'ถ้าสายไม่มี GM ผู้สอบทานคนสุดท้ายเป็นผู้ส่งผล');
step('การแจ้งเตือนของหัวหน้า','c5-bell.png',['เห็นจำนวนใบที่รอคุณ/รอขั้นถัดไป','ตัวเลขบนเมนูตรงกับคิวของคุณ'],null);
step('Dashboard ติดตามความคืบหน้า','c10-dash.png',['ภาพรวมจำนวนผู้เข้าร่วมและขั้นตอน','แสดงเฉพาะลูกทีมในสายของคุณ'],null);

// FAQ
s=pres.addSlide();s.background={color:'FFFFFF'};
s.addText('คำถามที่พบบ่อย',{x:0.5,y:0.3,w:9,h:0.7,fontFace:F,fontSize:28,bold:true,color:NAVY,margin:0,isTextBox:true});
const q=[['เข้าไม่ได้ / ลืม PIN','กด "ลืม PIN?" ตั้งเองด้วย OTP ทางอีเมล หรือขอ HR รีเซ็ต'],['ปุ่มประเมินเป็นสีเทา','ยังไม่มีสิทธิ์ประเมินตนเอง ติดต่อ HR'],['ไม่เห็นเกรด','เกรดแสดงหลัง MD อนุมัติและ Admin เปิดให้เห็น'],['ไม่เห็นลูกทีม','ตรวจว่า HR ระบุชื่อคุณในช่องสายบังคับบัญชาของลูกทีมถูกต้อง'],['ส่งแล้วแก้ไม่ได้','ให้ผู้ประเมินตีกลับ แล้วแก้และส่งใหม่'],['ไม่เห็นด้วยกับผล','ใช้ปุ่ม "ขอหารือ" ในหน้า 8. ผลประเมิน']];
q.forEach((r,i)=>{const col=i%2,row=Math.floor(i/2);const x=0.5+col*4.6,y=1.2+row*1.3;
 s.addShape(pres.ShapeType.roundRect,{x,y,w:4.4,h:1.15,fill:{color:LIGHT},rectRadius:0.1,line:{color:LIGHT}});
 s.addText(r[0],{x:x+0.2,y:y+0.1,w:4,h:0.35,fontFace:F,fontSize:15,bold:true,color:TEAL,margin:0,isTextBox:true});
 s.addText(r[1],{x:x+0.2,y:y+0.48,w:4,h:0.6,fontFace:F,fontSize:13,color:INK,margin:0,valign:'top',isTextBox:true});});
// end
s=pres.addSlide();s.background={color:NAVY};
s.addText('พร้อมใช้งานแล้ว',{x:0.6,y:1.6,w:8.8,h:1,fontFace:F,fontSize:44,bold:true,color:'FFFFFF',margin:0,isTextBox:true});
s.addText('มีปัญหาในการใช้งาน ติดต่อ HR ผู้ดูแลระบบ\nคู่มือ PDF และวิดีโอสอนใช้งานอยู่ในโฟลเดอร์ docs ของโครงการ',{x:0.6,y:2.8,w:8.8,h:1,fontFace:F,fontSize:18,color:'CADCFC',margin:0,isTextBox:true});
pres.writeFile({fileName:'/home/user/SML_PMS_Professional/docs/SML_PMS_UserGuide.pptx'}).then(()=>console.log('ok'));

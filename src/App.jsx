import React, { useState, useEffect } from 'react';
import {
 PlusCircle, Wallet, TrendingUp, TrendingDown, Trash2, PieChart,
 AlertCircle, Printer, Users, UserPlus, LayoutDashboard, LogIn, LogOut
} from 'lucide-react';

// Импорты Firebase
import { db, auth, googleProvider } from './firebase';
import {
 collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const App = () => {
 // --- STATE ---
 const [user, setUser] = useState(null);
 const [activeTab, setActiveTab] = useState('dashboard');
 const [loading, setLoading] = useState(true);

 // Данные из Firebase
 const [members, setMembers] = useState([]);
 const [transactions, setTransactions] = useState([]);

 // Формы
 const [form, setForm] = useState({
   type: 'income',
   category: 'Десятина',
   amount: '',
   description: '',
   date: new Date().toISOString().split('T')[0],
   memberId: ''
 });
 const [newMemberName, setNewMemberName] = useState('');

 // Списки категорий
 const incomeCategories = ['Десятина', 'Пожертвования', 'Обеты', 'Другие'];
 const expenseCategories = ['Аренда', 'Десятина в союз', 'Благословения', 'Мероприятия', 'Хозяйственные нужды'];

 // --- FIREBASE LISTENERS ---
 useEffect(() => {
   const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
     setUser(currentUser);
     setLoading(false);
   });
   return () => unsubscribeAuth();
 }, []);

 useEffect(() => {
   if (!user) return;

   // Слушаем транзакции
   const qTrans = query(collection(db, "transactions"), orderBy("date", "desc"));
   const unsubTrans = onSnapshot(qTrans, (snapshot) => {
     const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
     setTransactions(data);
   });

   // Слушаем участников
   const qMembers = query(collection(db, "members"), orderBy("name", "asc"));
   const unsubMembers = onSnapshot(qMembers, (snapshot) => {
     const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
     setMembers(data);
   });

   return () => {
     unsubTrans();
     unsubMembers();
   };
 }, [user]);

 // --- HANDLERS ---
 const handleLogin = async () => {
   try {
     await signInWithPopup(auth, googleProvider);
   } catch (error) {
     console.error("Login failed", error);
     alert("Ошибка входа: " + error.message);
   }
 };

 const handleLogout = () => signOut(auth);

 const handleAddTransaction = async (e) => {
   e.preventDefault();
   if (!form.amount || !form.description) return;

   await addDoc(collection(db, "transactions"), {
     type: form.type,
     category: form.category,
     amount: parseFloat(form.amount),
     description: form.description,
     date: form.date,
     memberId: form.memberId || null,
     createdAt: serverTimestamp(),
     createdBy: user.email // Аудит: кто добавил запись
   });

   setForm({ ...form, amount: '', description: '' });
 };

 const handleAddMember = async (e) => {
   e.preventDefault();
   if (!newMemberName.trim()) return;

   await addDoc(collection(db, "members"), {
     name: newMemberName.trim(),
     createdAt: serverTimestamp()
   });
   setNewMemberName('');
 };

 const deleteTransaction = async (id) => {
   if (window.confirm('Вы уверены, что хотите удалить эту запись?')) {
     await deleteDoc(doc(db, "transactions", id));
   }
 };

 // --- CALCULATIONS ---
 const totalIncome = transactions
   .filter(t => t.type === 'income')
   .reduce((acc, curr) => acc + curr.amount, 0);

 const totalExpense = transactions
   .filter(t => t.type === 'expense')
   .reduce((acc, curr) => acc + curr.amount, 0);

 const balance = totalIncome - totalExpense;

 const expenseBreakdown = transactions
   .filter(t => t.type === 'expense')
   .reduce((acc, curr) => {
     acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
     return acc;
   }, {});

 const sortedExpenses = Object.entries(expenseBreakdown)
   .sort(([,a], [,b]) => b - a);

 // Member Stats Logic
 const getMemberStats = () => {
   return members.map(member => {
     const memberTrans = transactions.filter(t => t.memberId === member.id && t.type === 'income');
     const tithe = memberTrans.filter(t => t.category === 'Десятина').reduce((sum, t) => sum + t.amount, 0);
     const offering = memberTrans.filter(t => t.category === 'Пожертвования').reduce((sum, t) => sum + t.amount, 0);
     const vow = memberTrans.filter(t => t.category === 'Обеты').reduce((sum, t) => sum + t.amount, 0);
     const other = memberTrans.filter(t => t.category === 'Другие').reduce((sum, t) => sum + t.amount, 0);
     const total = tithe + offering + vow + other;
     
     const dates = memberTrans.map(t => new Date(t.date));
     const lastDate = dates.length > 0 ? new Date(Math.max.apply(null, dates)) : null;

     return { ...member, tithe, offering, vow, other, total, lastDate };
   }).sort((a, b) => b.total - a.total);
 };

 const memberStats = getMemberStats();
 const handlePrint = () => window.print();

 // --- RENDER LOGIN SCREEN ---
 if (loading) return <div className="min-h-screen flex items-center justify-center">Загрузка...</div>;
 
 if (!user) {
   return (
     <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
       <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg text-center">
         <Wallet className="w-16 h-16 text-slate-900 mx-auto mb-6" />
         <h1 className="text-2xl font-bold mb-2">Бюджет Церкви</h1>
         <p className="text-slate-500 mb-8">Войдите, чтобы управлять финансами</p>
         <button
           onClick={handleLogin}
           className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-3 px-4 rounded-lg hover:bg-slate-800 transition-all font-medium"
         >
           <LogIn className="w-5 h-5" />
           Войти через Google
         </button>
       </div>
     </div>
   );
 }

 // --- MAIN APP RENDER ---
 return (
   <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-4 md:p-8 print:bg-white print:p-0">
     <style>{`
       @media print {
         .no-print { display: none !important; }
         .print-only { display: block !important; }
         body { background: white; }
       }
     `}</style>

     <div className="max-w-6xl mx-auto space-y-8">
       {/* Header & Nav */}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-6 border-slate-200">
         <div>
           <h1 className="text-3xl font-bold text-slate-900">Бюджет Церкви</h1>
           <div className="text-sm text-slate-500 mt-1 flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
             Онлайн: {user.email}
           </div>
         </div>
         
         <div className="flex gap-2 mt-4 md:mt-0 items-center no-print flex-wrap">
           <button
             onClick={() => setActiveTab('dashboard')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
           >
             <LayoutDashboard className="w-4 h-4" />
             Обзор
           </button>
           <button
             onClick={() => setActiveTab('people')}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'people' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
           >
             <Users className="w-4 h-4" />
             Люди
           </button>
           <div className="w-px h-6 bg-slate-300 mx-2"></div>
           <button onClick={handlePrint} className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50" title="Печать"><Printer className="w-4 h-4" /></button>
           <button onClick={handleLogout} className="p-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50" title="Выйти"><LogOut className="w-4 h-4" /></button>
         </div>
       </div>

       {/* --- DASHBOARD --- */}
       {activeTab === 'dashboard' && (
         <>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
               <div><p className="text-slate-500 text-sm">Баланс</p><p className="text-2xl font-bold">{balance.toLocaleString()} ₽</p></div>
               <div className={`p-3 rounded-full ${balance >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}><Wallet className="w-6 h-6 text-slate-700"/></div>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
               <div><p className="text-slate-500 text-sm">Приход</p><p className="text-2xl font-bold">{totalIncome.toLocaleString()} ₽</p></div>
               <div className="bg-blue-100 p-3 rounded-full"><TrendingUp className="w-6 h-6 text-blue-600"/></div>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
               <div><p className="text-slate-500 text-sm">Расход</p><p className="text-2xl font-bold">{totalExpense.toLocaleString()} ₽</p></div>
               <div className="bg-orange-100 p-3 rounded-full"><TrendingDown className="w-6 h-6 text-orange-600"/></div>
             </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             <div className="lg:col-span-2 space-y-6">
               {/* Transaction Form */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
                 <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><PlusCircle className="w-5 h-5 text-blue-600" />Новая запись</h3>
                 <form onSubmit={handleAddTransaction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="col-span-2 md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Тип</label>
                      <div className="flex rounded-md shadow-sm">
                        <button type="button" onClick={() => setForm({...form, type: 'income', category: incomeCategories[0]})} className={`flex-1 px-4 py-2 text-sm font-medium rounded-l-lg border ${form.type === 'income' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Приход</button>
                        <button type="button" onClick={() => setForm({...form, type: 'expense', category: expenseCategories[0], memberId: ''})} className={`flex-1 px-4 py-2 text-sm font-medium rounded-r-lg border ${form.type === 'expense' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white'}`}>Расход</button>
                      </div>
                   </div>
                   <div className="col-span-2 md:col-span-1">
                     <label className="block text-sm font-medium text-slate-700 mb-1">
                       {form.type === 'income' ? 'От кого' : 'Контрагент'}
                     </label>
                     <select
                       disabled={form.type === 'expense'}
                       value={form.memberId}
                       onChange={e => setForm({...form, memberId: e.target.value})}
                       className="w-full rounded-lg border-slate-300 shadow-sm p-2 border disabled:bg-slate-100"
                     >
                       <option value="">-- Анонимно / Общий --</option>
                       {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Категория</label>
                     <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full rounded-lg border p-2">
                       {(form.type === 'income' ? incomeCategories : expenseCategories).map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Сумма</label>
                     <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full rounded-lg border p-2" placeholder="0.00" />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Дата</label>
                     <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full rounded-lg border p-2" />
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Описание</label>
                     <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full rounded-lg border p-2" />
                   </div>
                   <button type="submit" className="col-span-2 bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800">Добавить в базу</button>
                 </form>
               </div>

               {/* List */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="px-6 py-4 border-b bg-slate-50"><h3 className="font-semibold text-slate-800">История операций</h3></div>
                 <div className="divide-y divide-slate-100">
                   {transactions.length === 0 ? <div className="p-4 text-center text-slate-400">Пусто</div> : transactions.map(t => {
                     const memberName = t.memberId ? members.find(m => m.id === t.memberId)?.name : null;
                     return (
                       <div key={t.id} className="p-4 flex justify-between items-center text-sm">
                         <div>
                           <span className="font-medium text-slate-900">{t.category}</span>
                           <span className="text-slate-500 mx-2">•</span>
                           <span className="text-slate-500">{t.description}</span>
                           {memberName && <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{memberName}</span>}
                           <div className="text-xs text-slate-400 mt-1">{new Date(t.date).toLocaleDateString('ru-RU')}</div>
                         </div>
                         <div className="flex items-center gap-3">
                           <span className={t.type === 'income' ? 'text-emerald-600 font-bold' : 'text-slate-600 font-bold'}>
                             {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()} ₽
                           </span>
                           <button onClick={() => deleteTransaction(t.id)} className="text-slate-300 hover:text-red-500 no-print"><Trash2 className="w-4 h-4"/></button>
                         </div>
                       </div>
                     )
                   })}
                 </div>
               </div>
             </div>

             {/* Stats Sidebar */}
             <div className="space-y-6">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><PieChart className="w-5 h-5 text-orange-600"/> Расходы</h3>
                  <div className="space-y-3">
                    {sortedExpenses.length === 0 ? <p className="text-sm text-slate-400">Нет данных</p> : sortedExpenses.map(([cat, amt]) => (
                      <div key={cat} className="text-sm">
                        <div className="flex justify-between mb-1"><span>{cat}</span><span className="font-medium">{amt.toLocaleString()} ₽</span></div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full"><div className="bg-orange-500 h-1.5 rounded-full" style={{width: `${(amt/totalExpense)*100}%`}}></div></div>
                      </div>
                    ))}
                  </div>
               </div>
             </div>
           </div>
         </>
       )}

       {/* --- PEOPLE TAB --- */}
       {activeTab === 'people' && (
         <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
           <div className="lg:col-span-1 space-y-6 no-print">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                 <h3 className="font-semibold mb-4 flex items-center gap-2"><UserPlus className="w-5 h-5 text-blue-600"/> Добавить</h3>
                 <form onSubmit={handleAddMember} className="space-y-4">
                   <input type="text" placeholder="ФИО" className="w-full border p-2 rounded-lg" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} />
                   <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Создать</button>
                 </form>
              </div>
           </div>
           <div className="lg:col-span-3">
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-semibold">Даяния прихожан</h3></div>
               <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                     <tr>
                       <th className="px-6 py-3">Имя</th>
                       <th className="px-6 py-3 text-right">Десятины</th>
                       <th className="px-6 py-3 text-right">Жертвы</th>
                       <th className="px-6 py-3 text-right">Обеты</th>
                       <th className="px-6 py-3 text-right">Итого</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {memberStats.map(m => (
                       <tr key={m.id} className="hover:bg-slate-50">
                         <td className="px-6 py-4 font-medium">{m.name}</td>
                         <td className="px-6 py-4 text-right">{m.tithe > 0 ? m.tithe.toLocaleString() : '-'}</td>
                         <td className="px-6 py-4 text-right">{m.offering > 0 ? m.offering.toLocaleString() : '-'}</td>
                         <td className="px-6 py-4 text-right font-bold text-purple-700">{m.vow > 0 ? m.vow.toLocaleString() : '-'}</td>
                         <td className="px-6 py-4 text-right font-bold">{m.total.toLocaleString()}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
           </div>
         </div>
       )}
     </div>
   </div>
 );
};

export default App;
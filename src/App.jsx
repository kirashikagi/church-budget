import React, { useState, useEffect } from 'react';
import {
 PlusCircle, Wallet, TrendingUp, TrendingDown, Trash2, PieChart,
 Printer, Users, UserPlus, LayoutDashboard, LogIn, LogOut, FileText, Menu, X
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
 const [isMenuOpen, setIsMenuOpen] = useState(false);

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
     createdBy: user.email
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
   if (window.confirm('Удалить запись?')) {
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
     const total = tithe + offering + vow + memberTrans.filter(t => t.category === 'Другие').reduce((sum, t) => sum + t.amount, 0);
     
     return { ...member, tithe, offering, vow, total };
   }).sort((a, b) => b.total - a.total);
 };

 // --- FULL REPORT GENERATOR ---
 const downloadFullReport = () => {
   const date = new Date().toLocaleDateString('ru-RU');
   let report = `=== ПОЛНЫЙ ОТЧЕТ БЮДЖЕТА ===\nДата: ${date}\nСформировал: ${user.email}\n\n`;
   report += `БАЛАНС: ${balance.toLocaleString()} ₽\nПриход: ${totalIncome.toLocaleString()} ₽\nРасход: ${totalExpense.toLocaleString()} ₽\n\n`;
   
   report += `--- РАСХОДЫ ---\n`;
   sortedExpenses.forEach(([cat, amt]) => {
     const percent = totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) : 0;
     report += `${cat}: ${amt.toLocaleString()} ₽ (${percent}%)\n`;
   });
   report += `\n--- ЛЮДИ (Даяния) ---\n`;
   const memberStats = getMemberStats();
   memberStats.forEach(m => report += `${m.name}: ${m.total} ₽ (Дес: ${m.tithe}, Жертв: ${m.offering})\n`);
   report += `\n--- ЖУРНАЛ ---\n`;
   transactions.forEach(t => {
       const sign = t.type === 'income' ? '+' : '-';
       report += `[${t.date}] ${sign}${t.amount} | ${t.category} | ${t.description}\n`;
   });

   const element = document.createElement("a");
   const file = new Blob([report], {type: 'text/plain'});
   element.href = URL.createObjectURL(file);
   element.download = `Budget_Full_${new Date().toISOString().split('T')[0]}.txt`;
   document.body.appendChild(element);
   element.click();
   document.body.removeChild(element);
 };

 // --- LOGIN SCREEN ---
 if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Загрузка системы...</div>;
 
 if (!user) {
   return (
     <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6">
       <div className="max-w-md w-full bg-white p-10 rounded-2xl shadow-xl text-center border border-slate-200">
         <div className="bg-slate-900 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
           <Wallet className="w-10 h-10 text-white" />
         </div>
         <h1 className="text-3xl font-bold mb-2 text-slate-800">Бюджет Церкви</h1>
         <p className="text-slate-500 mb-8 text-lg">Управление ресурсами Царства</p>
         <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white py-4 px-6 rounded-xl hover:bg-emerald-700 transition-all font-semibold text-lg shadow-md active:scale-95">
           <LogIn className="w-6 h-6" /> Войти в систему
         </button>
       </div>
     </div>
   );
 }

 // --- APP INTERFACE ---
 return (
   <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20 print:bg-white print:pb-0">
     <style>{`@media print {.no-print { display: none !important; }}`}</style>

     {/* STICKY HEADER */}
     <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm px-4 py-3 flex justify-between items-center no-print">
        <div className="flex items-center gap-3">
           <div className={`p-2 rounded-lg ${balance >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
               <Wallet className="w-6 h-6" />
           </div>
           <div>
               <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Баланс</p>
               <p className="text-lg font-bold leading-none">{balance.toLocaleString()} ₽</p>
           </div>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 bg-slate-100 rounded-lg md:hidden">
           {isMenuOpen ? <X className="w-6 h-6"/> : <Menu className="w-6 h-6"/>}
        </button>

        {/* Desktop Nav */}
        <div className="hidden md:flex gap-2">
           <NavButtons activeTab={activeTab} setActiveTab={setActiveTab} downloadFullReport={downloadFullReport} handleLogout={handleLogout} />
        </div>
     </div>

     {/* Mobile Menu */}
     {isMenuOpen && (
       <div className="md:hidden bg-white border-b border-slate-200 p-4 space-y-2 shadow-lg no-print absolute w-full z-40">
           <NavButtons activeTab={activeTab} setActiveTab={(tab) => {setActiveTab(tab); setIsMenuOpen(false)}} downloadFullReport={downloadFullReport} handleLogout={handleLogout} mobile />
       </div>
     )}

     {/* MAIN CONTAINER: w-full for full width, px-2 for minimal padding on mobile */}
     <div className="w-full max-w-7xl mx-auto px-2 md:px-4 py-4 space-y-6">
       
       {/* --- DASHBOARD TAB --- */}
       {activeTab === 'dashboard' && (
         <>
           {/* KPI Cards */}
           <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
               <p className="text-slate-400 text-xs mb-1">Приход</p>
               <p className="text-lg font-bold text-slate-900">{totalIncome.toLocaleString()}</p>
               <TrendingUp className="w-4 h-4 text-emerald-500 mt-2" />
             </div>
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
               <p className="text-slate-400 text-xs mb-1">Расход</p>
               <p className="text-lg font-bold text-slate-900">{totalExpense.toLocaleString()}</p>
               <TrendingDown className="w-4 h-4 text-orange-500 mt-2" />
             </div>
             <div className="bg-slate-800 p-4 rounded-xl shadow-sm text-white col-span-2">
               <p className="text-slate-400 text-xs mb-1">Маржа</p>
               <p className="text-2xl font-bold">
                 {totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(1) : 0}%
               </p>
             </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 space-y-6">
               
               {/* Transaction Form */}
               <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 no-print">
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PlusCircle className="w-5 h-5 text-blue-600" /> Добавить операцию</h3>
                 <form onSubmit={handleAddTransaction} className="space-y-4">
                   <div className="flex bg-slate-100 p-1 rounded-lg">
                       <button type="button" onClick={() => setForm({...form, type: 'income'})} className={`flex-1 py-3 rounded-md text-sm font-bold transition-all ${form.type === 'income' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>Приход (+)</button>
                       <button type="button" onClick={() => setForm({...form, type: 'expense', memberId: ''})} className={`flex-1 py-3 rounded-md text-sm font-bold transition-all ${form.type === 'expense' ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500'}`}>Расход (-)</button>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                       <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-lg p-3 text-lg font-semibold" placeholder="Сумма" />
                       <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-lg p-3" />
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-lg p-3 h-12">
                           {(form.type === 'income' ? incomeCategories : expenseCategories).map(c => <option key={c} value={c}>{c}</option>)}
                       </select>
                       <select disabled={form.type === 'expense'} value={form.memberId} onChange={e => setForm({...form, memberId: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-lg p-3 disabled:opacity-50 h-12">
                           <option value="">-- Анонимно --</option>
                           {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                       </select>
                   </div>

                   <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-lg p-3" placeholder="Описание" />
                   
                   <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-slate-800 active:scale-95 transition-all">
                       Сохранить
                   </button>
                 </form>
               </div>

               {/* List */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700">Лента операций</div>
                  <div className="divide-y divide-slate-100">
                   {transactions.length === 0 ? <div className="p-6 text-center text-slate-400">Пока пусто</div> : transactions.map(t => (
                       <div key={t.id} className="p-4 flex justify-between items-start gap-3 hover:bg-slate-50">
                           <div className="flex-1">
                               <div className="flex justify-between items-center">
                                   <span className="font-semibold text-slate-800 text-base">{t.category}</span>
                                   <span className={`font-bold text-base ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                       {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}
                                   </span>
                               </div>
                               <div className="text-sm text-slate-500 mt-1 leading-snug">{t.description}</div>
                               <div className="text-xs text-slate-400 mt-2 flex gap-2">
                                   <span>{new Date(t.date).toLocaleDateString()}</span>
                                   {t.memberId && members.find(m => m.id === t.memberId) && (
                                       <span className="bg-slate-100 px-1.5 rounded text-slate-600">
                                           {members.find(m => m.id === t.memberId).name}
                                       </span>
                                   )}
                               </div>
                           </div>
                           <button onClick={() => deleteTransaction(t.id)} className="text-slate-300 hover:text-red-500 p-2 no-print"><Trash2 className="w-5 h-5"/></button>
                       </div>
                   ))}
                  </div>
               </div>
             </div>

             {/* Sidebar Stats */}
             <div className="space-y-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                   <h3 className="font-bold text-slate-800 mb-4">Топ расходов</h3>
                   <div className="space-y-4">
                       {sortedExpenses.map(([cat, amt]) => (
                            <div key={cat}>
                               <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{cat}</span><span className="font-bold">{amt.toLocaleString()}</span></div>
                               <div className="w-full bg-slate-100 h-2 rounded-full"><div className="bg-orange-500 h-2 rounded-full" style={{width: `${(amt/totalExpense)*100}%`}}></div></div>
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
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center no-print sticky top-0">
               <h3 className="font-bold">Люди</h3>
               <form onSubmit={handleAddMember} className="flex gap-2">
                   <input type="text" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Имя" className="border rounded-lg px-3 py-2 text-sm" />
                   <button type="submit" className="bg-blue-600 text-white p-2 rounded-lg"><PlusCircle className="w-5 h-5"/></button>
               </form>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                   <thead className="bg-slate-50 text-slate-500 font-medium">
                       <tr><th className="p-3">Имя</th><th className="p-3 text-right">Десятина</th><th className="p-3 text-right">Всего</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {getMemberStats().map(m => (
                           <tr key={m.id}>
                               <td className="p-3 font-medium">{m.name}</td>
                               <td className="p-3 text-right text-emerald-600">{m.tithe.toLocaleString()}</td>
                               <td className="p-3 text-right font-bold">{m.total.toLocaleString()}</td>
                           </tr>
                       ))}
                   </tbody>
               </table>
            </div>
         </div>
       )}
     </div>
   </div>
 );
};

// Sub-component for Menu Buttons
const NavButtons = ({activeTab, setActiveTab, downloadFullReport, handleLogout, mobile}) => {
   const baseClass = mobile ? "w-full justify-start py-3 px-4 text-base border-b border-slate-50" : "text-sm px-3 py-2";
   return (
       <>
           <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 rounded-lg font-medium transition-colors ${baseClass} ${activeTab === 'dashboard' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-600'}`}>
               <LayoutDashboard className="w-4 h-4" /> Обзор
           </button>
           <button onClick={() => setActiveTab('people')} className={`flex items-center gap-2 rounded-lg font-medium transition-colors ${baseClass} ${activeTab === 'people' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-600'}`}>
               <Users className="w-4 h-4" /> Люди
           </button>
           <div className={`h-px bg-slate-200 my-1 ${!mobile && 'hidden'}`}></div>
           <button onClick={downloadFullReport} className={`flex items-center gap-2 text-emerald-700 hover:bg-emerald-50 rounded-lg font-medium transition-colors ${baseClass}`}>
               <FileText className="w-4 h-4" /> Отчет
           </button>
           <button onClick={handleLogout} className={`flex items-center gap-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors ${baseClass}`}>
               <LogOut className="w-4 h-4" /> Выйти
           </button>
       </>
   )
}

export default App;
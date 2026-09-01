# Email to ABA PayWay Support

Send to the ABA PayWay integration / merchant support address that sent your
sandbox credentials. Fill in the two `[...]` parts before sending.

**Subject:** Sandbox KHQR cannot be paid — Merchant ID ec460802

---

Dear ABA PayWay Support Team,

My name is [your name]. I am building an online ordering app for our shop
Ai-Cha and Zhengda. Customers order from a Telegram Mini App and pay with KHQR.

Our sandbox account:

- Merchant ID: **ec460802**
- Sandbox login: **rithsilanew2020**
- API URL: https://checkout-sandbox.payway.com.kh

We tested our integration on 1 September 2026. I want to share the result and
ask for your help.

## 1. What is working

1. We call `/api/payment-gateway/v1/payments/purchase` with
   `payment_option = abapay_khqr_deeplink`.
2. The API works. It returns `qrString`, `qrImage`, and `abapay_deeplink`.
3. Our app shows the KHQR to the customer.
4. We call `/api/payment-gateway/v1/payments/check-transaction-2`.
5. It works too. It returns status **PENDING** and the correct amount.

So our merchant ID, our hash, and our API calls are all correct. Thank you.

## 2. What is not working

**We cannot pay the KHQR in sandbox.**

We scan the QR with the ABA Mobile app. The payment never happens. The status
always stays PENDING until it expires.

We checked the QR data. This is what is inside:

- Bakong account (tag 30): `abaakhppxxx@abaa`
- Merchant account: `111111111111111` (fifteen number 1)
- Merchant name (tag 59): `rithsilanew2020`
- Merchant city (tag 60): empty
- Amount: 0.15 USD

We think the merchant account `111111111111111` is only a test value, so no
real bank app can pay it. Please tell us if this is correct.

Because of this, our sandbox **Transactions** page is still empty. It says
"There is no transaction."

## 3. Our questions

1. How can we pay a KHQR in sandbox? Do you have a test payer account or a test
   ABA Mobile app for this?
2. If sandbox KHQR cannot be paid, please confirm this in writing. Then we will
   test with cards in the portal instead, and we will do one small real payment
   in production.
3. What do you need from us to review our integration and give us production
   credentials?
4. How do we send you our domain and server IP for whitelisting?
5. For production, please set our correct merchant name and merchant city on
   our KHQR profile. The city is empty now, and the name `rithsilanew2020` is
   not our shop name. Our real shop name is [your shop name].

## 4. Next step from our side

While we wait for your answer, we will:

1. Make a test payment with your test card in the sandbox portal.
2. Check that our app marks the order as paid after your API says APPROVED.

Please tell me if you need any transaction ID or a screenshot. I can send them.

Thank you very much for your help.

Best regards,
[your name]
Ai-Cha & Zhengda
[your phone number]
[your email]
